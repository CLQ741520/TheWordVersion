import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const pool = mysql.createPool({
  host: process.env.VITE_DB_HOST || 'localhost',
  port: parseInt(process.env.VITE_DB_PORT || '3306'),
  user: process.env.VITE_DB_USER || 'root',
  password: process.env.VITE_DB_PASSWORD || '',
  database: process.env.VITE_DB_NAME || 'Word_App',
});

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

/**
 * 从 Free Dictionary API 获取音标
 * https://api.dictionaryapi.dev/api/v2/entries/en/<word>
 */
async function fetchPhonetic(word: string): Promise<string> {
  try {
    const response = await axios.get(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      { timeout: 8000 }
    );

    const data = response.data;
    if (!Array.isArray(data) || data.length === 0) return '';

    const entry = data[0];

    if (entry.phonetic) return entry.phonetic;

    if (entry.phonetics && entry.phonetics.length > 0) {
      for (const p of entry.phonetics) {
        if (p.text) return p.text;
      }
    }

    return '';
  } catch (error) {
    console.error(`FreeDict phonetic error for ${word}:`, error);
    return '';
  }
}

/**
 * 从有道词典获取音标和中译（后备来源，覆盖 Free Dictionary API 没有的生僻词）
 * https://dict.youdao.com/jsonapi
 */
async function fetchFromYoudao(word: string): Promise<{ phonetic: string; translation: string }> {
  try {
    const response = await axios.get('https://dict.youdao.com/jsonapi', {
      params: {
        jsonversion: 2,
        client: 'mobile',
        q: word,
      },
      timeout: 8000,
    });

    const data = response.data;
    let phonetic = '';
    let translation = '';

    // 音标：优先英式，没有则用美式
    if (data.symbol) {
      if (data.symbol.ph_en) phonetic = data.symbol.ph_en;
      else if (data.symbol.ph_am) phonetic = data.symbol.ph_am;
    }

    // 中译：从 ec（英中词典）结果中提取
    if (data.ec?.word?.[0]?.trs) {
      const trs = data.ec.word[0].trs;
      const defs: string[] = [];
      for (const tr of trs.slice(0, 3)) {
        const text = tr.tr?.[0]?.l?.i?.[0];
        if (text && typeof text === 'string') {
          defs.push(text);
        }
      }
      if (defs.length > 0) {
        translation = defs.join('；');
      }
    }

    return { phonetic, translation };
  } catch (error) {
    console.error(`Youdao API error for ${word}:`, error);
    return { phonetic: '', translation: '' };
  }
}

/**
 * 获取音标（多源兜底）：Free Dictionary API → 有道词典
 */
async function fetchPhoneticWithFallback(word: string): Promise<string> {
  const phonetic = await fetchPhonetic(word);
  if (phonetic) return phonetic;

  const youdaoResult = await fetchFromYoudao(word);
  return youdaoResult.phonetic || '';
}

/**
 * 获取中译（多源兜底）：百度翻译 → 有道词典
 */
async function fetchTranslation(word: string): Promise<string> {
  // 百度翻译
  const baiduResult = await translateWithBaidu(word);
  if (baiduResult.translation && /[一-龥]/.test(baiduResult.translation)) {
    return baiduResult.translation;
  }

  // 有道词典（后备）
  const youdaoResult = await fetchFromYoudao(word);
  if (youdaoResult.translation && /[一-龥]/.test(youdaoResult.translation)) {
    return youdaoResult.translation;
  }

  return '';
}

/**
 * 从百度翻译获取中文翻译
 */
async function translateWithBaidu(word: string): Promise<{ phonetic: string; translation: string }> {
  try {
    const accessToken = await getBaiduAccessToken();

    const response = await axios.post(
      'https://aip.baidubce.com/rpc/2.0/mt/texttrans/v1',
      {
        q: word,
        from: 'en',
        to: 'zh',
      },
      {
        params: {
          access_token: accessToken,
        },
        timeout: 8000,
      }
    );

    const data = response.data;
    if (data && data.result && data.result.trans_result && data.result.trans_result.length > 0) {
      const trans = data.result.trans_result[0];
      return {
        phonetic: '',
        translation: trans.dst || '',
      };
    }
    return { phonetic: '', translation: '' };
  } catch (error) {
    console.error(`Baidu Translate error for ${word}:`, error);
    return { phonetic: '', translation: '' };
  }
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
  'let': { phonetic: '/let/', translation: '让；允许' },
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
  'give up': { phonetic: '/ɡɪv ʌp/', translation: '放弃；认输' },
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

  // 1. \u5148\u67e5\u786c\u7f16\u7801\u8bcd\u5178\uff08\u6700\u5feb\u8def\u5f84\uff09
  if (wordDictionary[lowerWord]) {
    return wordDictionary[lowerWord];
  }

  const isPhrase = word.includes(' ');
  let phonetic = '';
  let translation = '';

  // 2. \u5e76\u884c\u83b7\u53d6\u97f3\u6807\u548c\u4e2d\u8bd1\uff08\u5747\u542b\u591a\u6e90\u515c\u5e95\uff09
  const [phoneticResult, translationResult] = await Promise.all([
    fetchPhoneticWithFallback(word).catch(() => ''),
    fetchTranslation(word).catch(() => ''),
  ]);

  if (phoneticResult) phonetic = phoneticResult;
  if (translationResult) translation = translationResult;

  // 3. \u77ed\u8bed\u5904\u7406\uff1a\u9010\u8bcd\u62fc\u5408\u97f3\u6807
  if (!phonetic && isPhrase) {
    const words = word.split(' ');
    const phonetics: string[] = [];

    for (const w of words) {
      const lowerW = w.toLowerCase();
      if (wordDictionary[lowerW]) {
        const clean = wordDictionary[lowerW].phonetic.replace(/[\/()]/g, '').trim();
        if (clean) phonetics.push(clean);
      } else {
        const p = await fetchPhoneticWithFallback(w);
        if (p) {
          const clean = p.replace(/[\/()]/g, '').trim();
          if (clean) phonetics.push(clean);
        }
      }
    }

    if (phonetics.length > 0) {
      phonetic = `/${phonetics.join(' ')}/`;
    }
  }

  // 4. \u77ed\u8bed\u7684\u4e2d\u8bd1\u540e\u5907\uff1a\u5982\u679c\u4e0a\u9762\u6ca1\u67e5\u5230\uff0c\u7528\u8bcd\u7ec4\u4e2d\u7b2c\u4e00\u4e2a\u5df2\u77e5\u5355\u8bcd\u7684\u7ffb\u8bd1
  if (!translation && isPhrase) {
    for (const w of lowerWord.split(' ')) {
      if (wordDictionary[w]) {
        translation = wordDictionary[w].translation;
        break;
      }
    }
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
      
      const [dbRows] = await pool.execute(
        'SELECT phonetic, translation FROM word_info WHERE word = ?',
        [lowerWord]
      );
      
      const dbResult = (dbRows as { phonetic: string; translation: string }[])[0];
      
      let phonetic = dbResult?.phonetic || '';
      let translation = dbResult?.translation || '';

      if (!phonetic || (!translation || !/[\u4e00-\u9fa5]/.test(translation))) {
        const info = await getWordInfo(word);
        
        if (!phonetic && info.phonetic) {
          phonetic = info.phonetic;
        }
        
        if (!translation || !/[\u4e00-\u9fa5]/.test(translation)) {
          if (info.translation && /[\u4e00-\u9fa5]/.test(info.translation)) {
            translation = info.translation;
          }
        }

        if (phonetic || translation) {
          await pool.execute(
            `INSERT INTO word_info (word, phonetic, translation) 
             VALUES (?, ?, ?) 
             ON DUPLICATE KEY UPDATE phonetic = VALUES(phonetic), translation = VALUES(translation)`,
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
      await pool.execute(
        `INSERT INTO word_info (word, phonetic, translation) 
         VALUES (?, ?, ?) 
         ON DUPLICATE KEY UPDATE phonetic = VALUES(phonetic), translation = VALUES(translation)`,
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
    
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      
      const [result] = await connection.execute(
        'INSERT INTO recognition_record (image_name, image_size, recognized_words, status, error_message) VALUES (?, ?, ?, ?, ?)',
        [imageName, imageSize, JSON.stringify(words), status, errorMessage || '']
      );
      
      const recordId = (result as any).insertId;
      
      for (const word of words) {
        await connection.execute(
          'INSERT INTO word_recognition (record_id, word) VALUES (?, ?)',
          [recordId, word]
        );
      }
      
      await connection.commit();
      res.json({ success: true, recordId });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
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
