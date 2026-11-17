import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';
import fs from 'fs';
import XLSX from 'xlsx-js-style';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
// 桌面版通过 HOST=127.0.0.1 限制为仅本机访问；服务器部署默认监听所有网卡
const HOST = process.env.HOST || '0.0.0.0';

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ── SQLite 初始化 ──
// 可通过环境变量 SQLITE_DB_PATH 自定义数据库路径（如持久化卷挂载路径）
const DB_PATH = process.env.SQLITE_DB_PATH || path.resolve(__dirname, '../data/word_app.db');
let db: any = null;

async function initDatabase() {
  const SQL = await initSqlJs();

  // 确保 data 目录存在
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // 如果已有数据库文件，加载它
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // 建表（IF NOT EXISTS）
  db.run(`
    CREATE TABLE IF NOT EXISTS word_info (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL UNIQUE,
      phonetic TEXT DEFAULT '',
      translation TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS recognition_record (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_name TEXT NOT NULL,
      image_size INTEGER DEFAULT 0,
      recognized_words TEXT,
      status TEXT DEFAULT 'success',
      error_message TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS word_recognition (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id INTEGER NOT NULL,
      word TEXT NOT NULL,
      FOREIGN KEY (record_id) REFERENCES recognition_record(id) ON DELETE CASCADE
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS wordbook (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL UNIQUE,
      phonetic TEXT DEFAULT '',
      translation TEXT DEFAULT '',
      source TEXT DEFAULT 'manual',
      status TEXT DEFAULT 'learning',
      repetitions INTEGER DEFAULT 0,
      ease REAL DEFAULT 2.5,
      interval_days INTEGER DEFAULT 0,
      due_at TEXT DEFAULT (datetime('now', 'localtime')),
      last_review_at TEXT,
      review_count INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      wrong_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS study_record (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL,
      action TEXT NOT NULL,
      quality INTEGER,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_wordbook_due ON wordbook(due_at)');
  db.run('CREATE INDEX IF NOT EXISTS idx_study_record_created ON study_record(created_at)');
  db.run('CREATE INDEX IF NOT EXISTS idx_study_record_word ON study_record(word)');

  saveDatabase();
  console.log(`SQLite 数据库已就绪: ${DB_PATH}`);
}

/** 将数据库写回磁盘 */
function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

/** 查询辅助：执行 SELECT 返回对象数组 */
function dbQueryAll(sql: string, params: any[] = []): any[] {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

/**
 * 执行辅助：INSERT / UPDATE / DELETE
 * 注意：saveDatabase() 内部调用 db.export() 会把 last_insert_rowid 重置为 0，
 * 所以必须在落盘前读取自增 ID 并返回。
 */
function dbRun(sql: string, params: any[] = []): number {
  db.run(sql, params);
  const lastInsertId = Number(db.exec('SELECT last_insert_rowid()')[0]?.values[0][0] ?? 0);
  saveDatabase();
  return lastInsertId;
}

/** 批量写入：事务内执行，结束后只落盘一次 */
function dbRunBatch(statements: { sql: string; params: any[] }[]) {
  if (statements.length === 0) return;
  db.run('BEGIN');
  try {
    for (const stmt of statements) db.run(stmt.sql, stmt.params);
    db.run('COMMIT');
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
  saveDatabase();
}

/** 本地时间格式，与 SQLite datetime('now','localtime') 保持一致 */
function formatLocalDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function formatLocalDateOnly(date: Date): string {
  return formatLocalDateTime(date).slice(0, 10);
}

/** 限制并发地执行异步任务，避免一次性打爆第三方接口 */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

type ReviewQuality = 0 | 1 | 2; // 0=忘记 1=模糊 2=认识

interface ReviewState {
  repetitions: number;
  ease: number;
  interval_days: number;
  due_at: string;
  status: 'learning' | 'mastered';
}

/** 三档简易 SM-2 间隔重复调度 */
function scheduleNextReview(row: any, quality: ReviewQuality): ReviewState {
  let repetitions = Number(row.repetitions) || 0;
  let ease = Number(row.ease) || 2.5;
  let intervalDays = Number(row.interval_days) || 0;

  if (quality === 2) {
    repetitions += 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 3;
    else intervalDays = Math.max(1, Math.round((intervalDays || 1) * ease));
    ease = Math.min(3.0, ease + 0.1);
  } else if (quality === 1) {
    intervalDays = Math.max(1, Math.round((intervalDays || 1) * 0.6));
  } else {
    repetitions = 0;
    intervalDays = 1;
    ease = Math.max(1.3, ease - 0.2);
  }

  const due = new Date();
  due.setDate(due.getDate() + intervalDays);

  return {
    repetitions,
    ease,
    interval_days: intervalDays,
    due_at: formatLocalDateTime(due),
    status: repetitions >= 3 ? 'mastered' : 'learning',
  };
}

/** 从可选来源中补齐单词的音标与中译（优先复用 word_info 缓存） */
async function resolveWordInfo(word: string): Promise<{ phonetic: string; translation: string }> {
  const lowerWord = word.toLowerCase();
  const cached = dbQueryAll('SELECT phonetic, translation FROM word_info WHERE word = ?', [lowerWord])[0];
  const cachedPhonetic = cached?.phonetic ?? '';
  const cachedTranslation = cached?.translation ?? '';

  // 缓存音标必须合法且已规范化（排除带 "(r)" 的旧数据）
  const cachedPhoneticUsable =
    !!cachedPhonetic &&
    isValidPhonetic(cachedPhonetic) &&
    normalizePhonetic(cachedPhonetic) === cachedPhonetic;
  const cachedTranslationUsable = !!cachedTranslation && hasChinese(cachedTranslation);

  if (cachedPhoneticUsable && cachedTranslationUsable) {
    return {
      phonetic: cachedPhonetic,
      translation: simplifyTranslation(cachedTranslation) || cachedTranslation,
    };
  }

  const info = await getWordInfo(lowerWord);
  const phonetic =
    (cachedPhoneticUsable ? cachedPhonetic : info.phonetic) ||
    normalizePhonetic(cachedPhonetic) ||
    '';
  const translation =
    (cachedTranslationUsable
      ? simplifyTranslation(cachedTranslation) || cachedTranslation
      : info.translation) ||
    simplifyTranslation(cachedTranslation) ||
    cachedTranslation ||
    '';

  // 回写词典缓存（存规范化后的值），避免下次收录同一单词时重复请求第三方接口
  if (phonetic || translation) {
    dbRun(
      `INSERT INTO word_info (word, phonetic, translation)
       VALUES (?, ?, ?)
       ON CONFLICT(word) DO UPDATE SET
         phonetic = excluded.phonetic,
         translation = excluded.translation,
         updated_at = datetime('now', 'localtime')`,
      [lowerWord, phonetic, translation]
    );
  }

  return { phonetic, translation };
}

function parsePositiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

// 初始化数据库
await initDatabase();

let cachedAccessToken: string | null = null;
let tokenExpireTime: number = 0;

async function getBaiduAccessToken(): Promise<string> {
  const apiKey = process.env.VITE_OCR_API_KEY;
  const secretKey = process.env.VITE_OCR_SECRET_KEY;

  if (!apiKey || apiKey === 'your_baidu_ocr_api_key') {
    throw new Error('请先在 .env 文件中配置 OCR_API_KEY');
  }

  if (!secretKey || secretKey === 'your_baidu_ocr_secret_key') {
    throw new Error('请先在 .env 文件中配置 OCR_SECRET_KEY');
  }

  if (cachedAccessToken && Date.now() < tokenExpireTime) {
    return cachedAccessToken;
  }

  const response = await axios.post(
    'https://aip.baidubce.com/oauth/2.0/token',
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: apiKey,
      client_secret: secretKey,
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  const data = response.data;
  if (data.access_token) {
    cachedAccessToken = data.access_token;
    tokenExpireTime = Date.now() + (data.expires_in - 60) * 1000;
    return cachedAccessToken;
  }

  throw new Error('获取百度访问令牌失败');
}

app.post('/api/ocr', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    
    if (!imageBase64) {
      return res.status(400).json({ error: '缺少图片数据' });
    }

    const accessToken = await getBaiduAccessToken();

    const response = await axios.post(
      'https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic',
      new URLSearchParams({
        image: imageBase64,
        language_type: 'CHN_ENG',
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        params: {
          access_token: accessToken,
        },
      }
    );

    const data = response.data;

    if (data.error_code) {
      return res.status(400).json({ error: `OCR 识别出错（${data.error_code}）：${data.error_msg}` });
    }

    res.json(data);
  } catch (error) {
    console.error('OCR Error:', error);
    const message = error instanceof Error ? error.message : 'OCR识别失败';
    res.status(500).json({ error: message });
  }
});

// ── 文档文本提取（Excel / Word / PDF），用于从文本类文件中提取单词 ──
app.post('/api/extract-text', async (req, res) => {
  try {
    const { fileName, fileBase64 } = req.body ?? {};
    if (typeof fileName !== 'string' || typeof fileBase64 !== 'string' || !fileBase64) {
      return res.status(400).json({ error: '缺少文件数据' });
    }

    const buffer = Buffer.from(fileBase64, 'base64');
    if (buffer.length === 0) return res.status(400).json({ error: '文件内容为空' });
    if (buffer.length > 30 * 1024 * 1024) {
      return res.status(400).json({ error: '文件超过 30MB，请拆分后再上传' });
    }

    const ext = path.extname(fileName).toLowerCase();
    let text = '';

    if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const lines: string[] = [];
      for (const sheetName of workbook.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
          header: 1,
          raw: false,
        }) as unknown as unknown[][];
        for (const row of rows) {
          const values = row
            .map((cell) => (cell == null ? '' : String(cell).trim()))
            .filter((cell) => cell !== '');
          if (values.length > 0) lines.push(values.join(' '));
        }
      }
      text = lines.join('\n');
    } else if (ext === '.docx') {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (ext === '.pdf') {
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        text = result.text;
      } finally {
        await parser.destroy();
      }
    } else if (ext === '.txt' || ext === '.md') {
      text = buffer.toString('utf8');
    } else {
      return res.status(400).json({
        error: '仅支持 Excel（.xlsx/.xls/.csv）、Word（.docx）、PDF（.pdf）和文本文件',
      });
    }

    text = text.trim();
    if (!text) {
      return res
        .status(422)
        .json({ error: '没有从文件中提取到文本，扫描版 PDF 请改用图片识别' });
    }

    res.json({ fileName, text });
  } catch (error) {
    console.error('Extract text error:', error);
    const message = error instanceof Error ? error.message : '文件解析失败';
    res.status(500).json({ error: `文件解析失败：${message}` });
  }
});

// ── 通用请求配置 ──
const REQUEST_TIMEOUT = 12000;
const MAX_RETRIES = 1;

/** 带重试的 HTTP GET（指数退避） */
async function fetchWithRetry(url: string, options: any = {}, retries = MAX_RETRIES): Promise<any> {
  const opts = { timeout: REQUEST_TIMEOUT, ...options };
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, 300 * Math.pow(2, attempt - 1)));
      }
      return await axios.get(url, opts);
    } catch (err: any) {
      lastErr = err;
      if (err.response?.status === 404 || err.response?.status === 400) throw err;
    }
  }
  throw lastErr ?? new Error('max retries exceeded');
}

// ── 音标工具函数 ──

/**
 * IPA 合法字符集。
 * 除常见音标外，额外允许 ɹ/ɾ/ɻ（r 的变体）、成音节辅音 l̩/n̩（组合变音符 U+0300-U+036F）、
 * ʰ/ʲ 等附加符号，避免合法音标被误判丢弃。
 */
const IPA_CHARS =
  /^[a-zA-Zɑæɒɔəɛɜɪʊʌɐɘɵɤɯɰʉɨʏɚɝɞɡŋʃʒðθɹɾɻɭɲɳɴʂʐɕʑçʝɣʁʕʔɦʋɱɶʎʍɥʜʢʡʤʧʰʷʲˠˤⁿˡˌˈː.\-‑‿'()\[\]\/\s̀-ͯ]+$/;

const VOWEL_OR_LETTER = /[a-zA-Zɑæɒɔəɛɜɪʊʌɐɘɵɤɯɰʉɨʏɚɝ]/;

/** 清洗音标格式：去掉可省略音括号，统一用 / / 包裹 */
function normalizePhonetic(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let cleaned = raw.trim();
  // ə(r) 这类括号表示可省略音，对中小学生显示时直接去掉
  cleaned = cleaned.replace(/[（(][^）)]*[）)]/g, '');
  // 去掉首尾的方括号或斜杠，再统一加 /
  cleaned = cleaned.replace(/^[\[\/]+|[\]\/]+$/g, '').trim();
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  // FreeDict 偶尔返回 "-mɪnt" 这种残缺音标，不能当成完整音标
  if (!cleaned || cleaned.startsWith('-') || cleaned.endsWith('-')) return '';
  return `/${cleaned}/`;
}

/** 校验音标是否合法 IPA */
function isValidPhonetic(raw: string): boolean {
  if (!raw || typeof raw !== 'string') return false;
  const stripped = raw.replace(/^[\[\/]+|[\]\/]+$/g, '').trim();
  if (stripped.length < 2) return false;
  // 音标里不应出现汉字、数字或全角标点
  if (/[一-龥0-9]/.test(stripped)) return false;
  // 至少要有一个元音/字母，排除纯符号噪声
  if (!VOWEL_OR_LETTER.test(stripped)) return false;
  // 残缺音标（如 FreeDict 的 "-mɪnt"）视为无效，触发其他数据源补全
  if (stripped.startsWith('-') || stripped.endsWith('-')) return false;
  return IPA_CHARS.test(stripped);
}

// ── 音标数据源 ──

/**
 * 从 Free Dictionary API 获取音标（优先英式）
 */
async function fetchPhoneticFromFreeDict(word: string): Promise<{ phonetic: string; source: string }> {
  try {
    const response = await fetchWithRetry(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
    );
    const data = response.data;
    if (!Array.isArray(data) || data.length === 0) return { phonetic: '', source: '' };

    const entry = data[0];
    // 优先取 phonetics 中 audio 包含 'uk' 的英式音标
    if (entry.phonetics?.length > 0) {
      const ukPhonetic = entry.phonetics.find((p: any) =>
        p.audio && typeof p.audio === 'string' && p.audio.includes('-uk') && p.text
      );
      if (ukPhonetic?.text) return { phonetic: normalizePhonetic(ukPhonetic.text), source: 'FreeDict(UK)' };

      const anyPhonetic = entry.phonetics.find((p: any) => p.text);
      if (anyPhonetic?.text) return { phonetic: normalizePhonetic(anyPhonetic.text), source: 'FreeDict' };
    }

    if (entry.phonetic) return { phonetic: normalizePhonetic(entry.phonetic), source: 'FreeDict' };
    return { phonetic: '', source: '' };
  } catch {
    return { phonetic: '', source: '' };
  }
}

// 有道 trs 深度遍历（同之前）
function extractTrsTexts(trs: any[]): string[] {
  const results: string[] = [];
  const seen = new Set<string>();

  function walk(node: any) {
    if (!node || results.length >= 5) return;
    if (typeof node === 'string' && /[\u4e00-\u9fa5]/.test(node)) {
      const clean = node.replace(/\s+/g, ' ').trim();
      if (clean && !seen.has(clean)) { seen.add(clean); results.push(clean); }
      return;
    }
    if (Array.isArray(node)) { for (const item of node) walk(item); }
    else if (typeof node === 'object') {
      if (node.l) walk(node.l);
      if (node.i) walk(node.i);
      if (node.tr) walk(node.tr);
    }
  }
  walk(trs);
  return results.slice(0, 5);
}

/**
 * 从有道词典获取音标和中译
 */
async function fetchFromYoudao(word: string): Promise<{ phonetic: string; translation: string; source: string }> {
  try {
    const response = await fetchWithRetry('https://dict.youdao.com/jsonapi', {
      params: { jsonversion: 2, client: 'mobile', q: word },
    });
    const data = response.data;
    let phonetic = '';
    let translation = '';

    // 音标：有道实际把音标放在 ec.word[0].ukphone / usphone，symbol.ph_en 多数情况为空
    const ecWord = data.ec?.word?.[0];
    if (ecWord?.ukphone) phonetic = normalizePhonetic(ecWord.ukphone);
    else if (ecWord?.usphone) phonetic = normalizePhonetic(ecWord.usphone);

    // 兼容旧版返回结构
    if (!phonetic && data.symbol) {
      if (data.symbol.ph_en) phonetic = normalizePhonetic(data.symbol.ph_en);
      else if (data.symbol.ph_am) phonetic = normalizePhonetic(data.symbol.ph_am);
    }

    // 中译
    if (ecWord?.trs) {
      const texts = extractTrsTexts(ecWord.trs);
      if (texts.length > 0) translation = texts.join('；');
    }
    if (!translation && data.fanyi?.tran) {
      const t = data.fanyi.tran;
      if (typeof t === 'string' && /[\u4e00-\u9fa5]/.test(t)) translation = t;
    }

    return { phonetic, translation, source: phonetic ? 'Youdao' : '' };
  } catch {
    return { phonetic: '', translation: '', source: '' };
  }
}

/**
 * 从剑桥词典获取音标（HTML 爬取）
 */
async function fetchPhoneticFromCambridge(word: string): Promise<{ phonetic: string; source: string }> {
  try {
    const response = await fetchWithRetry(
      `https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(word)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }
    );
    const html = typeof response.data === 'string' ? response.data : '';
    // 英式音标 class: ipa dipa lpr-2 lpl-1, 美式: ipa dipa lpr-1 lpl-1
    const ukMatch = html.match(/<span class="[^"]*ipa[^"]*lpr-2[^"]*">([^<]+)<\/span>/);
    const usMatch = html.match(/<span class="[^"]*ipa[^"]*lpr-1[^"]*">([^<]+)<\/span>/);
    const anyMatch = html.match(/<span class="[^"]*ipa[^"]*">([^<]+)<\/span>/);
    const raw = ukMatch?.[1] || usMatch?.[1] || anyMatch?.[1] || '';
    if (raw) return { phonetic: normalizePhonetic(raw), source: 'Cambridge' };
    return { phonetic: '', source: '' };
  } catch {
    return { phonetic: '', source: '' };
  }
}

// ── 音标获取：并行竞速 + 英式优先 ──

/**
 * 并行请求 FreeDict / 有道 / 剑桥，取第一个合法结果。
 * 英式音标优先，非英式也接受但降级标记。
 */
async function fetchPhoneticParallel(word: string): Promise<{ phonetic: string; source: string }> {
  // 并行启动三个源
  const freeDictP = fetchPhoneticFromFreeDict(word);
  const youdaoP = fetchFromYoudao(word).then(r => ({ phonetic: r.phonetic, source: r.source }));
  const cambridgeP = fetchPhoneticFromCambridge(word);

  // 按可靠性排序收集
  const results = await Promise.allSettled([freeDictP, youdaoP, cambridgeP]);
  const valid: { phonetic: string; source: string }[] = [];

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.phonetic && isValidPhonetic(r.value.phonetic)) {
      valid.push(r.value);
    }
  }

  if (valid.length === 0) return { phonetic: '', source: '' };

  // 优先选英式来源
  const ukPreferred = valid.find(v => v.source.includes('UK') || v.source === 'Cambridge');
  if (ukPreferred) return ukPreferred;

  return valid[0];
}

// ── 中译 ──

async function translateWithBaidu(word: string): Promise<string> {
  try {
    const accessToken = await getBaiduAccessToken();
    const response = await axios.post(
      'https://aip.baidubce.com/rpc/2.0/mt/texttrans/v1',
      { q: word, from: 'en', to: 'zh' },
      { params: { access_token: accessToken }, timeout: REQUEST_TIMEOUT }
    );
    const data = response.data;
    if (data?.result?.trans_result?.length > 0) {
      return data.result.trans_result[0].dst || '';
    }
    return '';
  } catch {
    return '';
  }
}

function hasChinese(text: string): boolean {
  return /[\u4e00-\u9fa5\u3000-\u303F\uFF00-\uFFEF\u3400-\u4DBF]/.test(text);
}

/**
 * 把词典返回的长释义压缩成适合中小学生的 1~2 个核心义项。
 * 例：ability 的 "n. 能力，能够；才能，技能，本领" → "能力；才能"
 */
function simplifyTranslation(raw: string): string {
  if (!raw) return "";
  let text = raw.trim();

  // 去掉词性前缀（n. / v. / adj. 等，可能连续出现）
  text = text.replace(/^(?:(?:n|v|vt|vi|adj|adv|prep|pron|conj|num|art|int|aux|abbr)\.\s*)+/i, "");
  // 去掉括号补充说明，如（某事）、(尤指)
  text = text.replace(/[（(][^）)]*[）)]/g, "");

  const senses: string[] = [];
  const hasHan = (value: string) => /[一-龥]/.test(value);
  const isExplanatory = (value: string) =>
    /^(指|表示|意思是|用于|形容|例如|即)/.test(value) || [...value].length > 12;

  const pushSense = (value: string) => {
    const sense = value
      .split(/[：:]/)[0]
      .trim()
      .replace(/^[.\s]+|[.\s]+$/g, "");
    if (!sense || !hasHan(sense) || isExplanatory(sense) || senses.includes(sense)) return;
    senses.push(sense);
  };

  const groups = text.split(/[；;]/).map((item) => item.trim()).filter(Boolean);

  if (groups.length <= 1) {
    // 只有一组时（如 "回想，记得，记起…"），取前两个小义项
    for (const part of (groups[0] ?? "").split(/[，,、]/)) {
      pushSense(part);
      if (senses.length >= 2) break;
    }
  } else {
    // 多个大义项时，每个大义项只取第一个核心词
    for (const group of groups) {
      pushSense(group.split(/[，,、]/)[0]);
      if (senses.length >= 2) break;
    }
  }

  if (senses.length === 0) {
    const fallback = text.split(/[；;，,、：:]/)[0].trim();
    return fallback && hasHan(fallback) ? [...fallback].slice(0, 16).join("") : "";
  }

  return senses.join("；");
}

/** 获取中译：百度 → 有道，并统一压缩为适合中小学生的释义 */
async function fetchTranslation(word: string): Promise<string> {
  const baiduTrans = await translateWithBaidu(word);
  if (baiduTrans && hasChinese(baiduTrans)) {
    return simplifyTranslation(baiduTrans) || [...baiduTrans].slice(0, 20).join("");
  }

  const youdaoResult = await fetchFromYoudao(word);
  if (youdaoResult.translation && hasChinese(youdaoResult.translation)) {
    return (
      simplifyTranslation(youdaoResult.translation) ||
      [...youdaoResult.translation].slice(0, 20).join("")
    );
  }

  return '';
}

const wordDictionary: Record<string, { phonetic: string; translation: string }> = {
  'ability': { phonetic: '/əˈbɪləti/', translation: '能力；才干' },
  'across': { phonetic: '/əˈkrɒs/', translation: '穿过；横跨；在对面' },
  'am': { phonetic: '/æm/', translation: '是；我' },
  'are': { phonetic: '/ɑː(r)/', translation: '是；在' },
  'be': { phonetic: '/biː/', translation: '是；成为' },
  'best': { phonetic: '/best/', translation: '最好的；最佳' },
  'because': { phonetic: '/bɪˈkɒz/', translation: '因为' },
  'because of': { phonetic: '/bɪˈkɒz ɒv/', translation: '因为；由于' },
  'book': { phonetic: '/bʊk/', translation: '书；书籍；预订' },
  'cancer': { phonetic: '/ˈkænsə(r)/', translation: '癌症；癌' },
  'close': { phonetic: '/kləʊz/', translation: '关闭；接近；亲密的' },
  'come': { phonetic: '/kʌm/', translation: '来；来到' },
  'day': { phonetic: '/deɪ/', translation: '天；日子；白天' },
  'dear': { phonetic: '/dɪə(r)/', translation: '亲爱的；昂贵的' },
  'do': { phonetic: '/duː/', translation: '做；干；行动' },
  'down': { phonetic: '/daʊn/', translation: '向下；在下面' },
  'dish': { phonetic: '/dɪʃ/', translation: '盘子；碟子；菜肴' },
  'each': { phonetic: '/iːtʃ/', translation: '每个；各自' },
  'early': { phonetic: '/ˈɜːli/', translation: '早的；提早' },
  'everyone': { phonetic: '/ˈevriwʌn/', translation: '每个人；人人' },
  'everybody': { phonetic: '/ˈevribɒdi/', translation: '每个人；人人' },
  'fail': { phonetic: '/feɪl/', translation: '失败；不及格' },
  'far': { phonetic: '/fɑː(r)/', translation: '远的；遥远的' },
  'feed': { phonetic: '/fiːd/', translation: '喂养；饲养；饲料' },
  'floor': { phonetic: '/flɔː(r)/', translation: '地板；楼层' },
  'friend': { phonetic: '/frend/', translation: '朋友' },
  'from': { phonetic: '/frɒm/', translation: '从；来自' },
  'good': { phonetic: '/ɡʊd/', translation: '好的；良好的' },
  'goodbye': { phonetic: '/ˌɡʊdˈbaɪ/', translation: '再见' },
  'give': { phonetic: '/ɡɪv/', translation: '给；给予；赠送' },
  'give up': { phonetic: '/ɡɪv ʌp/', translation: '放弃；认输' },
  'great': { phonetic: '/ɡreɪt/', translation: '伟大的；极好的' },
  'hard': { phonetic: '/hɑːd/', translation: '硬的；困难的；努力地' },
  'happy': { phonetic: '/ˈhæpi/', translation: '快乐的；幸福的' },
  'have': { phonetic: '/hæv/', translation: '有；拥有' },
  'hello': { phonetic: '/həˈləʊ/', translation: '你好；喂' },
  'help': { phonetic: '/help/', translation: '帮助；援助' },
  'hi': { phonetic: '/haɪ/', translation: '嗨；你好' },
  'high': { phonetic: '/haɪ/', translation: '高的；高度' },
  'hope': { phonetic: '/həʊp/', translation: '希望；期望' },
  'ill': { phonetic: '/ɪl/', translation: '生病的；坏的' },
  'in': { phonetic: '/ɪn/', translation: '在...里面；进入' },
  'is': { phonetic: '/ɪz/', translation: '是' },
  'jump': { phonetic: '/dʒʌmp/', translation: '跳；跳跃' },
  'keep': { phonetic: '/kiːp/', translation: '保持；保留；继续' },
  'kind': { phonetic: '/kaɪnd/', translation: '和蔼的；种类' },
  'know': { phonetic: '/nəʊ/', translation: '知道；了解' },
  'let': { phonetic: '/let/', translation: '让；允许' },
  'lose': { phonetic: '/luːz/', translation: '失去；丢失；输' },
  'love': { phonetic: '/lʌv/', translation: '爱；热爱' },
  'make': { phonetic: '/meɪk/', translation: '做；制造；使' },
  'me': { phonetic: '/miː/', translation: '我（宾格）' },
  'money': { phonetic: '/ˈmʌni/', translation: '钱；货币' },
  'month': { phonetic: '/mʌnθ/', translation: '月；月份' },
  'more': { phonetic: '/mɔː(r)/', translation: '更多的；更多' },
  'much': { phonetic: '/mʌtʃ/', translation: '许多；大量' },
  'never': { phonetic: '/ˈnevə(r)/', translation: '从不；永不' },
  'nice': { phonetic: '/naɪs/', translation: '美好的；友好的' },
  'not': { phonetic: '/nɒt/', translation: '不；没有' },
  'now': { phonetic: '/naʊ/', translation: '现在；此刻' },
  'of': { phonetic: '/ɒv/', translation: '属于；关于' },
  'on': { phonetic: '/ɒn/', translation: '在...上面；关于' },
  'one': { phonetic: '/wʌn/', translation: '一；一个' },
  'or': { phonetic: '/ɔː(r)/', translation: '或者；还是' },
  'our': { phonetic: '/ˈaʊə(r)/', translation: '我们的' },
  'out': { phonetic: '/aʊt/', translation: '向外；出去' },
  'over': { phonetic: '/ˈəʊvə(r)/', translation: '在...上面；超过' },
  'ping-pong': { phonetic: '/ˈpɪŋ pɒŋ/', translation: '乒乓球' },
  'player': { phonetic: '/ˈpleɪə(r)/', translation: '运动员；选手；播放器' },
  'play': { phonetic: '/pleɪ/', translation: '玩；演奏；扮演' },
  'please': { phonetic: '/pliːz/', translation: '请；使高兴' },
  'really': { phonetic: '/ˈriːəli/', translation: '真正地；确实' },
  'remember': { phonetic: '/rɪˈmembə(r)/', translation: '记住；回忆' },
  'rubbish': { phonetic: '/ˈrʌbɪʃ/', translation: '垃圾；废话' },
  'run': { phonetic: '/rʌn/', translation: '跑；跑步；运行' },
  'say': { phonetic: '/seɪ/', translation: '说；讲' },
  'see': { phonetic: '/siː/', translation: '看见；看到' },
  'she': { phonetic: '/ʃiː/', translation: '她' },
  'so': { phonetic: '/səʊ/', translation: '如此；所以' },
  'sport': { phonetic: '/spɔːt/', translation: '运动；体育' },
  'star': { phonetic: '/stɑː(r)/', translation: '星星；明星' },
  'sweep': { phonetic: '/swiːp/', translation: '扫；打扫' },
  'take': { phonetic: '/teɪk/', translation: '拿；取；花费' },
  'thank': { phonetic: '/θæŋk/', translation: '感谢；谢谢' },
  'that': { phonetic: '/ðæt/', translation: '那；那个' },
  'the': { phonetic: '/ðə/', translation: '这；那' },
  'then': { phonetic: '/ðen/', translation: '然后；那时' },
  'there': { phonetic: '/ðeə(r)/', translation: '那里；在那里' },
  'they': { phonetic: '/ðeɪ/', translation: '他们；她们；它们' },
  'think': { phonetic: '/θɪŋk/', translation: '思考；认为' },
  'this': { phonetic: '/ðɪs/', translation: '这；这个' },
  'time': { phonetic: '/taɪm/', translation: '时间；时刻' },
  'to': { phonetic: '/tuː/', translation: '到；向；去' },
  'too': { phonetic: '/tuː/', translation: '也；太；很' },
  'try': { phonetic: '/traɪ/', translation: '尝试；努力' },
  'try your best': { phonetic: '/traɪ jɔː(r) best/', translation: '尽你最大努力' },
  'unit': { phonetic: '/ˈjuːnɪt/', translation: '单位；单元' },
  'up': { phonetic: '/ʌp/', translation: '向上；朝上' },
  'us': { phonetic: '/ʌs/', translation: '我们（宾格）' },
  'very': { phonetic: '/ˈveri/', translation: '非常；很' },
  'volleyball': { phonetic: '/ˈvɒlibɔːl/', translation: '排球' },
  'wash': { phonetic: '/wɒʃ/', translation: '洗；洗涤' },
  'we': { phonetic: '/wiː/', translation: '我们' },
  'well': { phonetic: '/wel/', translation: '好；很好；井' },
  'what': { phonetic: '/wɒt/', translation: '什么' },
  'when': { phonetic: '/wen/', translation: '什么时候；当...时' },
  'where': { phonetic: '/weə(r)/', translation: '哪里；在哪里' },
  'who': { phonetic: '/huː/', translation: '谁' },
  'why': { phonetic: '/waɪ/', translation: '为什么' },
  'with': { phonetic: '/wɪð/', translation: '和；与；带有' },
  'year': { phonetic: '/jɪə(r)/', translation: '年；年份' },
  'you': { phonetic: '/juː/', translation: '你；你们' },
  'your': { phonetic: '/jɔː(r)/', translation: '你的；你们的' },
  'stand': { phonetic: '/stænd/', translation: '站立；站着' },
  'stand up': { phonetic: '/stænd ʌp/', translation: '站起来；起立' },
  'sit': { phonetic: '/sɪt/', translation: '坐；坐下' },
  'sit down': { phonetic: '/sɪt daʊn/', translation: '坐下' },
  "let's": { phonetic: '/lets/', translation: '让我们' },
  'let us': { phonetic: '/let ʌs/', translation: '让我们' },
  'look': { phonetic: '/lʊk/', translation: '看；瞧' },
  'look at': { phonetic: '/lʊk æt/', translation: '看；查看' },
  'look for': { phonetic: '/lʊk fɔː(r)/', translation: '寻找；查找' },
  'put': { phonetic: '/pʊt/', translation: '放；放置' },
  'put on': { phonetic: '/pʊt ɒn/', translation: '穿上；戴上' },
  'put down': { phonetic: '/pʊt daʊn/', translation: '放下；记下' },
  'get': { phonetic: '/ɡet/', translation: '得到；获取' },
  'get up': { phonetic: '/ɡet ʌp/', translation: '起床；站起来' },
  'get down': { phonetic: '/ɡet daʊn/', translation: '下来；落下' },
  'go': { phonetic: '/ɡəʊ/', translation: '去；走' },
  'go to': { phonetic: '/ɡəʊ tuː/', translation: '去；前往' },
  'go away': { phonetic: '/ɡəʊ əˈweɪ/', translation: '走开；离开' },
  'come in': { phonetic: '/kʌm ɪn/', translation: '进来；进入' },
  'come on': { phonetic: '/kʌm ɒn/', translation: '来吧；加油' },
  'come out': { phonetic: '/kʌm aʊt/', translation: '出来；出版' },
  'take off': { phonetic: '/teɪk ɒf/', translation: '脱下；起飞' },
  'take care': { phonetic: '/teɪk keə(r)/', translation: '小心；保重' },
  'take care of': { phonetic: '/teɪk keə(r) ɒv/', translation: '照顾；照料' },
  'give back': { phonetic: '/ɡɪv bæk/', translation: '归还；送回' },
  'turn on': { phonetic: '/tɜːn ɒn/', translation: '打开；开启' },
  'turn off': { phonetic: '/tɜːn ɒf/', translation: '关闭；关掉' },
  'turn up': { phonetic: '/tɜːn ʌp/', translation: '调高；出现' },
  'turn down': { phonetic: '/tɜːn daʊn/', translation: '调低；拒绝' },
  'pick up': { phonetic: '/pɪk ʌp/', translation: '捡起；接载' },
  'put away': { phonetic: '/pʊt əˈweɪ/', translation: '收好；放好' },
  'wash up': { phonetic: '/wɒʃ ʌp/', translation: '洗碗；洗脸' },
  'clean up': { phonetic: '/kliːn ʌp/', translation: '打扫；清理' },
  'write down': { phonetic: '/raɪt daʊn/', translation: '写下；记下' },
  'listen to': { phonetic: '/ˈlɪsn tuː/', translation: '听；倾听' },
  'talk about': { phonetic: '/tɔːk əˈbaʊt/', translation: '谈论；讨论' },
  'think about': { phonetic: '/θɪŋk əˈbaʊt/', translation: '思考；考虑' },
  'speak to': { phonetic: '/spiːk tuː/', translation: '和...说话' },
  'wait for': { phonetic: '/weɪt fɔː(r)/', translation: '等待；等候' },
  'call on': { phonetic: '/kɔːl ɒn/', translation: '拜访；号召' },
  'work on': { phonetic: '/wɜːk ɒn/', translation: '从事；致力于' },
  'carry on': { phonetic: '/ˈkæri ɒn/', translation: '继续；进行' },
  'look forward to': { phonetic: '/lʊk ˈfɔːwəd tuː/', translation: '期待；盼望' },
  'pay attention to': { phonetic: '/peɪ əˈtenʃn tuː/', translation: '注意；留意' },
  'make sure': { phonetic: '/meɪk ʃʊə(r)/', translation: '确保；保证' },
  'make sense': { phonetic: '/meɪk sens/', translation: '有意义；讲得通' },
  'keep on': { phonetic: '/kiːp ɒn/', translation: '继续；持续' },
  'keep up': { phonetic: '/kiːp ʌp/', translation: '保持；跟上' },
  'catch up': { phonetic: '/kætʃ ʌp/', translation: '赶上；追上' },
  'run away': { phonetic: '/rʌn əˈweɪ/', translation: '逃跑；跑开' },
};

async function getWordInfo(word: string): Promise<{ phonetic: string; translation: string }> {
  const lowerWord = word.toLowerCase();

  // 1. 硬编码词典（最快路径）
  if (wordDictionary[lowerWord]) {
    const entry = wordDictionary[lowerWord];
    return {
      // 硬编码词表里大量英式 "(r)" 写法，统一按 normalize 规则清洗
      phonetic: normalizePhonetic(entry.phonetic) || entry.phonetic,
      translation: simplifyTranslation(entry.translation) || entry.translation,
    };
  }

  const isPhrase = word.includes(' ');
  let phonetic = '';
  let translation = '';

  // 2. 并行获取音标和翻译（音标三源竞速，翻译双源兜底）
  const [phoneticResult, translationResult] = await Promise.all([
    fetchPhoneticParallel(word).then(r => r.phonetic).catch(() => ''),
    fetchTranslation(word).catch(() => ''),
  ]);

  phonetic = phoneticResult;
  translation = translationResult;

  // 3. 音标校验：如果返回的音标不合法，清空
  if (phonetic && !isValidPhonetic(phonetic)) {
    console.warn(`[PhoneticValidation] "${word}" got invalid phonetic: "${phonetic}", discarding`);
    phonetic = '';
  }

  // 4. 词组处理：如果没有音标，逐词拼接
  if (!phonetic && isPhrase) {
    const words = word.split(/\s+/);
    const phonetics: string[] = [];

    // 对每个组成词并行查音标
    const wordPromises = words.map(async (w) => {
      const lowerW = w.toLowerCase();
      if (wordDictionary[lowerW]) {
        const clean = wordDictionary[lowerW].phonetic.replace(/[\/\[\]()]/g, '').trim();
        if (clean) return clean;
      }
      // 其次查 word_info 缓存，避免对同一组成词反复请求网络
      const cachedPhonetic = dbQueryAll(
        'SELECT phonetic FROM word_info WHERE word = ?',
        [lowerW]
      )[0]?.phonetic;
      if (cachedPhonetic && isValidPhonetic(cachedPhonetic)) {
        return cachedPhonetic.replace(/[\/\[\]]/g, '').trim();
      }
      const result = await fetchPhoneticParallel(w);
      if (result.phonetic) {
        return result.phonetic.replace(/[\/\[\]]/g, '').trim();
      }
      return '';
    });

    const parts = await Promise.all(wordPromises);
    for (const p of parts) {
      if (p) phonetics.push(p);
    }

    if (phonetics.length > 0) {
      phonetic = `/${phonetics.join(' ')}/`;
    }
  }

  // 5. 词组翻译后备：用组成词中第一个已知词的解释
  if (!translation && isPhrase) {
    for (const w of lowerWord.split(/\s+/)) {
      if (wordDictionary[w]) {
        translation = wordDictionary[w].translation;
        break;
      }
    }
  }

  // 6. 最终校验：确保返回的是干净数据
  if (phonetic && !isValidPhonetic(phonetic)) {
    console.warn(`[PhoneticValidation:FINAL] "${word}" phonetic invalid: "${phonetic}"`);
    phonetic = '';
  }

  return { phonetic, translation };
}

app.get('/api/words', async (req, res) => {
  try {
    const words = (req.query.words as string)?.split(',') || [];
    if (words.length === 0) {
      return res.json([]);
    }

    const results: { word: string; phonetic: string; translation: string }[] = [];

    for (const word of words) {
      const lowerWord = word.toLowerCase();

      const dbRows = dbQueryAll('SELECT phonetic, translation FROM word_info WHERE word = ?', [lowerWord]);
      const dbResult = dbRows[0];

      let phonetic = dbResult?.phonetic || '';
      let translation = dbResult?.translation || '';

      // 数据库音标也需要校验：如果存了脏数据（含 "(r)" 等），触发重新查询
      const dbPhoneticValid =
        phonetic && isValidPhonetic(phonetic) && normalizePhonetic(phonetic) === phonetic;
      const dbTranslationValid = translation && hasChinese(translation);

      if (!dbPhoneticValid || !dbTranslationValid) {
        const info = await getWordInfo(word);

        if (!dbPhoneticValid && info.phonetic) {
          phonetic = info.phonetic;
        }
        if (!dbTranslationValid && info.translation && hasChinese(info.translation)) {
          translation = info.translation;
        }

        // 回写数据库
        if (phonetic || translation) {
          dbRun(
            `INSERT INTO word_info (word, phonetic, translation)
             VALUES (?, ?, ?)
             ON CONFLICT(word) DO UPDATE SET phonetic = excluded.phonetic, translation = excluded.translation, updated_at = datetime('now', 'localtime')`,
            [lowerWord, phonetic, translation]
          );
        }
      }

      // 旧缓存里是完整词典释义，返回前统一压缩，保证老数据立即变短
      results.push({
        word,
        phonetic: normalizePhonetic(phonetic) || phonetic,
        translation: simplifyTranslation(translation) || translation,
      });
    }

    res.json(results);
  } catch (error) {
    console.error('Error fetching words:', error);
    res.status(500).json({ error: 'Failed to fetch words' });
  }
});

app.post('/api/words', async (req, res) => {
  try {
    const wordInfos = req.body as { word: string; phonetic: string; translation: string }[];

    for (const wordInfo of wordInfos) {
      dbRun(
        `INSERT INTO word_info (word, phonetic, translation)
         VALUES (?, ?, ?)
         ON CONFLICT(word) DO UPDATE SET phonetic = excluded.phonetic, translation = excluded.translation, updated_at = datetime('now', 'localtime')`,
        [wordInfo.word.toLowerCase(), wordInfo.phonetic, wordInfo.translation]
      );
    }

    res.json({ success: true, count: wordInfos.length });
  } catch (error) {
    console.error('Error saving words:', error);
    res.status(500).json({ error: 'Failed to save words' });
  }
});

app.post('/api/recognition', async (req, res) => {
  try {
    const { imageName, imageSize, status, errorMessage } = req.body;
    const words = Array.isArray(req.body?.words) ? req.body.words : [];

    const recordId = dbRun(
      'INSERT INTO recognition_record (image_name, image_size, recognized_words, status, error_message) VALUES (?, ?, ?, ?, ?)',
      [imageName || '', imageSize || 0, JSON.stringify(words), status || 'success', errorMessage || '']
    );

    if (words.length > 0) {
      dbRunBatch(
        words.map((word: string) => ({
          sql: 'INSERT INTO word_recognition (record_id, word) VALUES (?, ?)',
          params: [recordId, word],
        }))
      );
    }

    res.json({ success: true, recordId });
  } catch (error) {
    console.error('Error saving recognition:', error);
    res.status(500).json({ error: 'Failed to save recognition' });
  }
});

// ── 识别历史 ──

app.get('/api/recognition', (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 10000);
    const pageSize = parsePositiveInt(req.query.pageSize, 20, 100);
    const q = String(req.query.q ?? '').trim();
    const whereClause = q ? 'WHERE r.image_name LIKE ?' : '';
    const filterParams = q ? [`%${q}%`] : [];

    const total =
      dbQueryAll(`SELECT COUNT(*) AS c FROM recognition_record r ${whereClause}`, filterParams)[0]
        ?.c ?? 0;

    const items = dbQueryAll(
      `SELECT r.id, r.image_name, r.image_size, r.status, r.error_message, r.created_at,
              (SELECT COUNT(*) FROM word_recognition wr WHERE wr.record_id = r.id) AS word_count
       FROM recognition_record r
       ${whereClause}
       ORDER BY r.id DESC
       LIMIT ? OFFSET ?`,
      [...filterParams, pageSize, (page - 1) * pageSize]
    );

    res.json({ items, total, page, pageSize });
  } catch (error) {
    console.error('Error fetching recognition records:', error);
    res.status(500).json({ error: '获取识别历史失败' });
  }
});

app.get('/api/recognition/:id', (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: '无效的 ID' });

    const record = dbQueryAll('SELECT * FROM recognition_record WHERE id = ?', [id])[0];
    if (!record) return res.status(404).json({ error: '识别记录不存在' });

    let words: string[] = dbQueryAll(
      'SELECT word FROM word_recognition WHERE record_id = ? ORDER BY id',
      [id]
    ).map((row: any) => String(row.word));

    if (words.length === 0) {
      try {
        const parsed = JSON.parse(record.recognized_words || '[]');
        if (Array.isArray(parsed)) {
          words = parsed.filter((word: any) => typeof word === 'string');
        }
      } catch {
        words = [];
      }
    }

    const inWordbook = new Set<string>(
      words.length > 0
        ? dbQueryAll(
            `SELECT word FROM wordbook WHERE word IN (${words.map(() => '?').join(',')})`,
            words
          ).map((row: any) => String(row.word))
        : []
    );

    res.json({
      id: record.id,
      imageName: record.image_name,
      imageSize: record.image_size,
      status: record.status,
      errorMessage: record.error_message,
      createdAt: record.created_at,
      words: words.map((word) => ({ word, inWordbook: inWordbook.has(word) })),
    });
  } catch (error) {
    console.error('Error fetching recognition detail:', error);
    res.status(500).json({ error: '获取识别详情失败' });
  }
});

app.delete('/api/recognition/:id', (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: '无效的 ID' });

    const record = dbQueryAll('SELECT id FROM recognition_record WHERE id = ?', [id])[0];
    if (!record) return res.status(404).json({ error: '识别记录不存在' });

    // 记录与关联单词一起删除，避免留下孤儿数据
    dbRunBatch([
      { sql: 'DELETE FROM word_recognition WHERE record_id = ?', params: [id] },
      { sql: 'DELETE FROM recognition_record WHERE id = ?', params: [id] },
    ]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting recognition record:', error);
    res.status(500).json({ error: '删除识别记录失败' });
  }
});

// ── 生词本 ──

/** 生词本全部单词（用于识别结果标记「已收录」） */
app.get('/api/wordbook/words', (_req, res) => {
  try {
    const rows = dbQueryAll('SELECT word FROM wordbook');
    res.json(rows.map((r: any) => r.word));
  } catch (error) {
    console.error('Error listing wordbook words:', error);
    res.status(500).json({ error: '获取生词本单词失败' });
  }
});

app.get('/api/wordbook', (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 100000);
    const pageSize = parsePositiveInt(req.query.pageSize, 20, 200);
    const q = String(req.query.q ?? '').trim();
    const status = String(req.query.status ?? '').trim();

    const where: string[] = [];
    const params: any[] = [];
    if (q) {
      where.push('(word LIKE ? OR translation LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (status === 'learning' || status === 'mastered') {
      where.push('status = ?');
      params.push(status);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const totalRow = dbQueryAll(`SELECT COUNT(*) AS total FROM wordbook ${whereSql}`, params)[0];
    const items = dbQueryAll(
      `SELECT * FROM wordbook ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );

    // 历史数据可能存了 "(r)" 音标或长释义，返回时统一清洗
    const cleanedItems = items.map((item: any) => ({
      ...item,
      phonetic: normalizePhonetic(item.phonetic) || item.phonetic,
      translation: simplifyTranslation(item.translation) || item.translation,
    }));

    res.json({ items: cleanedItems, total: totalRow?.total ?? 0, page, pageSize });
  } catch (error) {
    console.error('Error listing wordbook:', error);
    res.status(500).json({ error: '获取生词本失败' });
  }
});

app.post('/api/wordbook', async (req, res) => {
  try {
    const payload = req.body;
    const rawItems: any[] = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.words)
        ? payload.words
        : payload?.word
          ? [payload]
          : [];

    const defaultSource = typeof payload?.source === 'string' ? payload.source : 'manual';
    const normalized: { word: string; phonetic: string; translation: string; source: string }[] = [];
    const seen = new Set<string>();

    for (const raw of rawItems) {
      const item = typeof raw === 'string' ? { word: raw } : raw;
      const word = String(item?.word ?? '').trim();
      if (!word || word.length > 100) continue;
      const key = word.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const rawPhonetic = String(item?.phonetic ?? '').trim();
      const rawTranslation = String(item?.translation ?? '').trim();
      normalized.push({
        word: key,
        phonetic: normalizePhonetic(rawPhonetic) || rawPhonetic,
        translation: simplifyTranslation(rawTranslation) || rawTranslation,
        source: String(item?.source ?? defaultSource).slice(0, 20),
      });
    }

    if (normalized.length === 0) {
      return res.status(400).json({ error: '没有可收录的单词' });
    }

    const existingRows = normalized.length > 0
      ? dbQueryAll(
          `SELECT word FROM wordbook WHERE word IN (${normalized.map(() => '?').join(',')})`,
          normalized.map((n) => n.word)
        )
      : [];
    const existing = new Set(existingRows.map((r: any) => r.word));

    const toAdd = normalized.filter((n) => !existing.has(n.word));

    const resolved = await mapLimit(toAdd, 5, async (item) => {
      if (item.phonetic && item.translation) return item;
      const info = await resolveWordInfo(item.word);
      return {
        ...item,
        phonetic: item.phonetic || info.phonetic,
        translation: item.translation || info.translation,
      };
    });

    const statements: { sql: string; params: any[] }[] = [];
    for (const item of resolved) {
      statements.push({
        sql: `INSERT INTO wordbook (word, phonetic, translation, source, due_at)
              VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
              ON CONFLICT(word) DO NOTHING`,
        params: [item.word, item.phonetic, item.translation, item.source],
      });
      statements.push({
        sql: `INSERT INTO study_record (word, action) VALUES (?, 'add')`,
        params: [item.word],
      });
    }
    dbRunBatch(statements);

    const addedWords = resolved.map((r) => r.word);
    const items = addedWords.length > 0
      ? dbQueryAll(
          `SELECT * FROM wordbook WHERE word IN (${addedWords.map(() => '?').join(',')})`,
          addedWords
        )
      : [];

    res.json({
      success: true,
      added: items.length,
      skipped: normalized.length - toAdd.length,
      items,
    });
  } catch (error) {
    console.error('Error adding to wordbook:', error);
    res.status(500).json({ error: '收录到生词本失败' });
  }
});

app.patch('/api/wordbook/:id', (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: '无效的 ID' });

    const row = dbQueryAll('SELECT * FROM wordbook WHERE id = ?', [id])[0];
    if (!row) return res.status(404).json({ error: '单词不存在' });

    const sets: string[] = [];
    const params: any[] = [];

    if (typeof req.body?.phonetic === 'string') {
      sets.push('phonetic = ?');
      params.push(req.body.phonetic.trim());
    }
    if (typeof req.body?.translation === 'string') {
      sets.push('translation = ?');
      params.push(req.body.translation.trim());
    }
    const resetProgress = req.body?.resetProgress === true;
    if (resetProgress) {
      sets.push('repetitions = 0', 'ease = 2.5', 'interval_days = 0');
      sets.push("due_at = datetime('now', 'localtime')");
      sets.push('last_review_at = NULL');
      sets.push("status = 'learning'");
    }
    if (
      !resetProgress &&
      (req.body?.status === 'learning' || req.body?.status === 'mastered')
    ) {
      sets.push('status = ?');
      params.push(req.body.status);
    }
    if (sets.length === 0) {
      return res.status(400).json({ error: '没有可更新的字段' });
    }

    sets.push("updated_at = datetime('now', 'localtime')");
    dbRun(`UPDATE wordbook SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
    const updated = dbQueryAll('SELECT * FROM wordbook WHERE id = ?', [id])[0];
    res.json({ success: true, item: updated });
  } catch (error) {
    console.error('Error updating wordbook item:', error);
    res.status(500).json({ error: '更新单词失败' });
  }
});

app.delete('/api/wordbook/:id', (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: '无效的 ID' });
    dbRun('DELETE FROM wordbook WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting wordbook item:', error);
    res.status(500).json({ error: '删除单词失败' });
  }
});

app.post('/api/wordbook/batch-delete', (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.map((v: any) => Number.parseInt(String(v), 10)).filter(Number.isFinite)
      : [];
    if (ids.length === 0) return res.status(400).json({ error: '缺少要删除的 ID' });

    dbRun(`DELETE FROM wordbook WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    console.error('Error batch deleting wordbook items:', error);
    res.status(500).json({ error: '批量删除失败' });
  }
});

// ── 复习（间隔重复） ──

app.get('/api/review/queue', (req, res) => {
  try {
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const mode = req.query.mode === 'wrong' ? 'wrong' : 'due';
    const where =
      mode === 'wrong'
        ? 'wrong_count > 0'
        : "due_at IS NULL OR due_at <= datetime('now', 'localtime')";
    const orderBy =
      mode === 'wrong' ? 'wrong_count DESC, updated_at DESC, id ASC' : 'due_at ASC, id ASC';

    const items = dbQueryAll(
      `SELECT * FROM wordbook WHERE ${where} ORDER BY ${orderBy} LIMIT ?`,
      [limit]
    );
    const dueCount = dbQueryAll(`SELECT COUNT(*) AS c FROM wordbook WHERE ${where}`)[0]?.c ?? 0;
    const totalCount = dbQueryAll('SELECT COUNT(*) AS c FROM wordbook')[0]?.c ?? 0;
    res.json({ items, dueCount, totalCount, mode });
  } catch (error) {
    console.error('Error fetching review queue:', error);
    res.status(500).json({ error: '获取复习队列失败' });
  }
});

app.post('/api/review/:id', (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const quality = Number(req.body?.quality);
    if (!Number.isFinite(id) || ![0, 1, 2].includes(quality)) {
      return res.status(400).json({ error: '参数无效' });
    }

    const row = dbQueryAll('SELECT * FROM wordbook WHERE id = ?', [id])[0];
    if (!row) return res.status(404).json({ error: '单词不存在' });

    const next = scheduleNextReview(row, quality as ReviewQuality);
    const actionMap = ['review_forgot', 'review_fuzzy', 'review_known'];
    const isCorrect = quality === 2 ? 1 : 0;

    dbRunBatch([
      {
        sql: `UPDATE wordbook SET
                repetitions = ?, ease = ?, interval_days = ?, due_at = ?, status = ?,
                last_review_at = datetime('now', 'localtime'),
                review_count = review_count + 1,
                correct_count = correct_count + ?,
                wrong_count = wrong_count + ?,
                updated_at = datetime('now', 'localtime')
              WHERE id = ?`,
        params: [
          next.repetitions,
          next.ease,
          next.interval_days,
          next.due_at,
          next.status,
          isCorrect,
          isCorrect ? 0 : 1,
          id,
        ],
      },
      {
        sql: 'INSERT INTO study_record (word, action, quality) VALUES (?, ?, ?)',
        params: [row.word, actionMap[quality as ReviewQuality], quality],
      },
    ]);

    res.json({ success: true, next });
  } catch (error) {
    console.error('Error submitting review:', error);
    res.status(500).json({ error: '提交复习结果失败' });
  }
});

// ── 测验 ──

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

app.get('/api/quiz', (req, res) => {
  try {
    const limit = parsePositiveInt(req.query.limit, 10, 30);
    const mode = req.query.mode === 'spelling' ? 'spelling' : 'choice';
    const pool = dbQueryAll(
      `SELECT id, word, phonetic, translation FROM wordbook
       WHERE translation IS NOT NULL AND translation != ''`
    );

    if (mode === 'spelling') {
      if (pool.length === 0) {
        return res.json({
          questions: [],
          message: '生词本还没有带释义的单词，先去识别页面收录一些吧',
        });
      }
      const picked = shuffle(pool).slice(0, Math.min(limit, pool.length));
      const questions = picked.map((row: any) => ({
        id: row.id,
        word: row.word,
        phonetic: row.phonetic,
        translation: row.translation,
        type: 'spelling',
        prompt: row.translation,
        answer: row.word,
        options: [],
        hint: String(row.word).replace(/[A-Za-z]+/g, (part: string) => {
          return part[0] + '_'.repeat(Math.max(0, part.length - 1));
        }),
      }));
      return res.json({ questions });
    }

    if (pool.length < 4) {
      return res.json({
        questions: [],
        message: '生词本至少需要 4 个带释义的单词才能开始测验',
      });
    }

    const picked = shuffle(pool).slice(0, Math.min(limit, pool.length));
    const questions = picked.map((row: any) => {
      const type = Math.random() < 0.5 ? 'en2zh' : 'zh2en';
      const prompt = type === 'en2zh' ? row.word : row.translation;
      const answer = type === 'en2zh' ? row.translation : row.word;

      const distractorPool = shuffle(
        pool.filter((p: any) => {
          const value = type === 'en2zh' ? p.translation : p.word;
          return value !== answer;
        })
      );
      const distractors: string[] = [];
      for (const candidate of distractorPool) {
        const value = type === 'en2zh' ? candidate.translation : candidate.word;
        if (!distractors.includes(value)) distractors.push(value);
        if (distractors.length >= 3) break;
      }

      return {
        id: row.id,
        word: row.word,
        phonetic: row.phonetic,
        translation: row.translation,
        type,
        prompt,
        answer,
        options: shuffle([answer, ...distractors]),
      };
    });

    res.json({ questions });
  } catch (error) {
    console.error('Error generating quiz:', error);
    res.status(500).json({ error: '生成测验失败' });
  }
});

app.post('/api/quiz/result', (req, res) => {
  try {
    const results = Array.isArray(req.body?.results) ? req.body.results : [];
    if (results.length === 0) return res.status(400).json({ error: '缺少测验结果' });

    const statements: { sql: string; params: any[] }[] = [];
    for (const item of results) {
      const id = Number.parseInt(String(item?.id), 10);
      if (!Number.isFinite(id)) continue;
      const row = dbQueryAll('SELECT * FROM wordbook WHERE id = ?', [id])[0];
      if (!row) continue;

      const correct = Boolean(item?.correct);
      statements.push({
        sql: 'INSERT INTO study_record (word, action) VALUES (?, ?)',
        params: [row.word, correct ? 'quiz_correct' : 'quiz_wrong'],
      });

      if (correct) {
        statements.push({
          sql: `UPDATE wordbook SET
                  review_count = review_count + 1,
                  correct_count = correct_count + 1,
                  last_review_at = datetime('now', 'localtime')
                WHERE id = ?`,
          params: [id],
        });
      } else {
        statements.push({
          sql: `UPDATE wordbook SET
                  review_count = review_count + 1,
                  wrong_count = wrong_count + 1,
                  status = 'learning',
                  due_at = datetime('now', 'localtime'),
                  last_review_at = datetime('now', 'localtime')
                WHERE id = ?`,
          params: [id],
        });
      }
    }

    dbRunBatch(statements);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving quiz result:', error);
    res.status(500).json({ error: '保存测验结果失败' });
  }
});

// ── 学习统计 ──

app.get('/api/stats', (_req, res) => {
  try {
    const wordbookRow = dbQueryAll(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'mastered' THEN 1 ELSE 0 END) AS mastered
       FROM wordbook`
    )[0] ?? { total: 0, mastered: 0 };

    const dueCount = dbQueryAll(
      `SELECT COUNT(*) AS c FROM wordbook WHERE due_at IS NULL OR due_at <= datetime('now', 'localtime')`
    )[0]?.c ?? 0;

    const todayStudied = dbQueryAll(
      `SELECT COUNT(DISTINCT word) AS c FROM study_record
       WHERE action != 'add' AND date(created_at) = date('now', 'localtime')`
    )[0]?.c ?? 0;

    const todayAdded = dbQueryAll(
      `SELECT COUNT(*) AS c FROM study_record
       WHERE action = 'add' AND date(created_at) = date('now', 'localtime')`
    )[0]?.c ?? 0;

    const practiceRow = dbQueryAll(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN action IN ('review_known', 'quiz_correct') THEN 1 ELSE 0 END) AS correct
       FROM study_record
       WHERE action LIKE 'review_%' OR action LIKE 'quiz_%'`
    )[0] ?? { total: 0, correct: 0 };

    const totalAdded = dbQueryAll(
      `SELECT COUNT(*) AS c FROM study_record WHERE action = 'add'`
    )[0]?.c ?? 0;

    const activityRows = dbQueryAll(
      `SELECT date(created_at) AS d, COUNT(DISTINCT word) AS c
       FROM study_record
       WHERE action != 'add' AND date(created_at) >= date('now', 'localtime', '-13 days')
       GROUP BY d`
    );
    const activityMap = new Map<string, number>(activityRows.map((r: any) => [r.d, r.c]));

    const last14Days: { date: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = formatLocalDateOnly(d);
      last14Days.push({ date: key, count: activityMap.get(key) ?? 0 });
    }

    // 连续学习天数：今天没有记录时从昨天开始回看
    const activeDates = new Set<string>(
      dbQueryAll('SELECT DISTINCT date(created_at) AS d FROM study_record WHERE action != \'add\'').map(
        (r: any) => r.d
      )
    );
    let streakDays = 0;
    const cursor = new Date();
    if (!activeDates.has(formatLocalDateOnly(cursor))) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while (activeDates.has(formatLocalDateOnly(cursor))) {
      streakDays++;
      cursor.setDate(cursor.getDate() - 1);
    }

    const topWrongWords = dbQueryAll(
      `SELECT word, phonetic, translation, wrong_count
       FROM wordbook
       WHERE wrong_count > 0
       ORDER BY wrong_count DESC, updated_at DESC
       LIMIT 10`
    );

    const recentRecords = dbQueryAll(
      `SELECT word, action, quality, created_at
       FROM study_record
       ORDER BY id DESC
       LIMIT 20`
    );

    const practiceTotal = Number(practiceRow.total) || 0;
    const practiceCorrect = Number(practiceRow.correct) || 0;
    const wordbookTotal = Number(wordbookRow.total) || 0;
    const masteredCount = Number(wordbookRow.mastered) || 0;

    res.json({
      wordbookTotal,
      masteredCount,
      learningCount: wordbookTotal - masteredCount,
      dueCount,
      todayStudied,
      todayAdded,
      totalAdded,
      practiceTotal,
      accuracy: practiceTotal > 0 ? practiceCorrect / practiceTotal : 0,
      masteryRate: wordbookTotal > 0 ? masteredCount / wordbookTotal : 0,
      streakDays,
      last14Days,
      topWrongWords,
      recentRecords,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: '获取学习统计失败' });
  }
});

// ── 学习活跃度（热力图） ──

app.get('/api/stats/activity', (req, res) => {
  try {
    const days = parsePositiveInt(req.query.days, 365, 730);
    const rows = dbQueryAll(
      `SELECT date(created_at) AS d, COUNT(DISTINCT word) AS c
       FROM study_record
       WHERE action != 'add'
       GROUP BY d`
    );
    const counts = new Map<string, number>(
      rows.map((r: any) => [String(r.d), Number(r.c) || 0])
    );

    const result: { date: string; count: number }[] = [];
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    cursor.setDate(cursor.getDate() - (days - 1));
    for (let i = 0; i < days; i++) {
      const key = formatLocalDateOnly(cursor);
      result.push({ date: key, count: counts.get(key) ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    let longestStreak = 0;
    let currentStreak = 0;
    for (const day of result) {
      if (day.count > 0) {
        currentStreak += 1;
        longestStreak = Math.max(longestStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }

    res.json({
      days: result,
      total: result.reduce((sum, day) => sum + day.count, 0),
      activeDays: result.filter((day) => day.count > 0).length,
      maxCount: result.reduce((max, day) => Math.max(max, day.count), 0),
      longestStreak,
    });
  } catch (error) {
    console.error('Error fetching activity:', error);
    res.status(500).json({ error: '获取学习活跃度失败' });
  }
});

// ── 服务器时间（北京时间），用于每日目标修改校验 ──
app.get('/api/time', (_req, res) => {
  const now = new Date();
  const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  res.json({
    iso: now.toISOString(),
    beijingDate: beijing.toISOString().slice(0, 10),
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 生产环境: 托管前端构建产物
if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve(__dirname, '../dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT} (${process.env.NODE_ENV || 'development'})`);
});
