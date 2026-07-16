import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

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

/** 执行辅助：INSERT / UPDATE / DELETE */
function dbRun(sql: string, params: any[] = []) {
  db.run(sql, params);
  saveDatabase();
}

/** 获取最后插入的 ID */
function dbLastInsertId(): number {
  return db.exec("SELECT last_insert_rowid() as id")[0]?.values[0][0] ?? 0;
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

/** IPA 音标合法字符集（允许 /、[]、重音、次重音、连字符等） */
const IPA_PATTERN = /^[\/\[\]]?[a-zɑæɒɔəɛɜɪʊʌɡŋʃʒðθʤʧˌˈː\.\- ]+[\/\[\]]?$/i;

/** 清洗音标格式：统一用 / / 包裹，去除 [] 和多余空格 */
function normalizePhonetic(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let cleaned = raw.trim();
  // 去掉首尾的方括号或斜杠，再统一加 /
  cleaned = cleaned.replace(/^[\[\/]+|[\]\/]+$/g, '').trim();
  cleaned = cleaned.replace(/\s+/g, ' ');
  if (!cleaned) return '';
  return `/${cleaned}/`;
}

/** 校验音标是否合法 IPA */
function isValidPhonetic(raw: string): boolean {
  if (!raw || typeof raw !== 'string') return false;
  const stripped = raw.replace(/^[\[\/]+|[\]\/]+$/g, '').trim();
  if (stripped.length < 2) return false;
  // 必须包含至少一个 IPA 特征字符（含普通字母）
  if (!IPA_PATTERN.test(raw)) return false;
  // 如果全是普通字母没有 IPA 特殊符号，至少长度够长才接受
  if (/^[a-zA-Z\s]+$/.test(stripped) && stripped.length < 4) return false;
  return true;
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

    // 音标：优先英式 → 美式
    if (data.symbol) {
      if (data.symbol.ph_en) phonetic = normalizePhonetic(data.symbol.ph_en);
      else if (data.symbol.ph_am) phonetic = normalizePhonetic(data.symbol.ph_am);
    }

    // 中译
    if (data.ec?.word?.[0]?.trs) {
      const texts = extractTrsTexts(data.ec.word[0].trs);
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

/** 获取中译：百度 → 有道 */
async function fetchTranslation(word: string): Promise<string> {
  const baiduTrans = await translateWithBaidu(word);
  if (baiduTrans && hasChinese(baiduTrans)) return baiduTrans;

  const youdaoResult = await fetchFromYoudao(word);
  if (youdaoResult.translation && hasChinese(youdaoResult.translation)) return youdaoResult.translation;

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
    return wordDictionary[lowerWord];
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

      // 数据库音标也需要校验：如果存了脏数据，触发重新查询
      const dbPhoneticValid = phonetic && isValidPhonetic(phonetic);
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

      results.push({ word, phonetic, translation });
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
    const { imageName, imageSize, words, status, errorMessage } = req.body;

    dbRun(
      'INSERT INTO recognition_record (image_name, image_size, recognized_words, status, error_message) VALUES (?, ?, ?, ?, ?)',
      [imageName, imageSize, JSON.stringify(words), status, errorMessage || '']
    );

    const recordId = dbLastInsertId();

    for (const word of words) {
      dbRun('INSERT INTO word_recognition (record_id, word) VALUES (?, ?)', [recordId, word]);
    }

    res.json({ success: true, recordId });
  } catch (error) {
    console.error('Error saving recognition:', error);
    res.status(500).json({ error: 'Failed to save recognition' });
  }
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT} (${process.env.NODE_ENV || 'development'})`);
});
