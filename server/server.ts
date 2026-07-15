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

async function fetchFromCDICT(word: string): Promise<{ phonetic: string; translation: string }> {
  try {
    const response = await axios.get(`https://api.pinyin.sogou.com/parse`, {
      params: {
        text: word,
        type: 2,
      },
      timeout: 8000,
    });

    const data = response.data;
    if (data && data.items && data.items.length > 0) {
      const item = data.items[0];
      let phonetic = '';
      let translation = '';

      if (item.pos) {
        phonetic = item.pos;
      }
      if (item.dict) {
        translation = item.dict;
      }

      if (phonetic || translation) {
        return { phonetic, translation };
      }
    }
    return { phonetic: '', translation: '' };
  } catch (error) {
    console.error(`CDICT API error for ${word}:`, error);
    return { phonetic: '', translation: '' };
  }
}

async function fetchFromFreeDict(word: string): Promise<{ phonetic: string; translation: string }> {
  try {
    const response = await axios.get(`https://api.freedictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, {
      timeout: 8000,
    });

    const data = response.data;
    if (!Array.isArray(data) || data.length === 0) {
      return { phonetic: '', translation: '' };
    }

    const entry = data[0];
    let phonetic = '';
    let translation = '';
    
    if (entry.phonetic) {
      phonetic = entry.phonetic;
    } else if (entry.phonetics && entry.phonetics.length > 0) {
      for (const p of entry.phonetics) {
        if (p.text) {
          phonetic = p.text;
          break;
        }
      }
    }

    if (entry.meanings && entry.meanings.length > 0) {
      const defs: string[] = [];
      for (const meaning of entry.meanings.slice(0, 2)) {
        if (meaning.definitions && meaning.definitions.length > 0) {
          defs.push(meaning.definitions[0].definition);
        }
      }
      if (defs.length > 0) {
        translation = defs.join('；');
      }
    }

    return { phonetic, translation };
  } catch (error) {
    console.error(`FreeDict API error for ${word}:`, error);
    return { phonetic: '', translation: '' };
  }
}

async function fetchFromWebDict(word: string): Promise<{ phonetic: string; translation: string }> {
  try {
    const response = await axios.get(`https://dict.cn/api/dict.php`, {
      params: {
        q: word,
      },
      timeout: 8000,
    });

    const data = response.data;
    if (data && typeof data === 'object') {
      let phonetic = '';
      let translation = '';

      if (data.symbol) {
        phonetic = data.symbol;
      }
      if (data.content) {
        translation = data.content;
      }

      if (phonetic || translation) {
        return { phonetic, translation };
      }
    }
    return { phonetic: '', translation: '' };
  } catch (error) {
    console.error(`WebDict API error for ${word}:`, error);
    return { phonetic: '', translation: '' };
  }
}

const wordDictionary: Record<string, { phonetic: string; translation: string }> = {
  'ability': { phonetic: '/əˈbɪləti/', translation: '能力；才干' },
  'across': { phonetic: '/əˈkrɒs/', translation: '穿过；横跨；在对面' },
  'best': { phonetic: '/best/', translation: '最好的；最佳' },
  'because': { phonetic: '/bɪˈkɒz/', translation: '因为' },
  'because of': { phonetic: '/bɪˈkɒz ɒv/', translation: '因为；由于' },
  'cancer': { phonetic: '/ˈkænsə(r)/', translation: '癌症；癌' },
  'dish': { phonetic: '/dɪʃ/', translation: '盘子；碟子；菜肴' },
  'fail': { phonetic: '/feɪl/', translation: '失败；不及格' },
  'far': { phonetic: '/fɑː(r)/', translation: '远的；遥远的' },
  'feed': { phonetic: '/fiːd/', translation: '喂养；饲养；饲料' },
  'floor': { phonetic: '/flɔː(r)/', translation: '地板；楼层' },
  'give': { phonetic: '/ɡɪv/', translation: '给；给予；赠送' },
  'give up': { phonetic: '/ɡɪv ʌp/', translation: '放弃；认输' },
  'hard': { phonetic: '/hɑːd/', translation: '硬的；困难的；努力地' },
  'high': { phonetic: '/haɪ/', translation: '高的；高度' },
  'hope': { phonetic: '/həʊp/', translation: '希望；期望' },
  'ill': { phonetic: '/ɪl/', translation: '生病的；坏的' },
  'jump': { phonetic: '/dʒʌmp/', translation: '跳；跳跃' },
  'keep': { phonetic: '/kiːp/', translation: '保持；保留；继续' },
  'kind': { phonetic: '/kaɪnd/', translation: '和蔼的；种类' },
  'lose': { phonetic: '/luːz/', translation: '失去；丢失；输' },
  'money': { phonetic: '/ˈmʌni/', translation: '钱；货币' },
  'month': { phonetic: '/mʌnθ/', translation: '月；月份' },
  'never': { phonetic: '/ˈnevə(r)/', translation: '从不；永不' },
  'ping-pong': { phonetic: '/ˈpɪŋ pɒŋ/', translation: '乒乓球' },
  'player': { phonetic: '/ˈpleɪə(r)/', translation: '运动员；选手；播放器' },
  'remember': { phonetic: '/rɪˈmembə(r)/', translation: '记住；回忆' },
  'rubbish': { phonetic: '/ˈrʌbɪʃ/', translation: '垃圾；废话' },
  'sport': { phonetic: '/spɔːt/', translation: '运动；体育' },
  'star': { phonetic: '/stɑː(r)/', translation: '星星；明星' },
  'sweep': { phonetic: '/swiːp/', translation: '扫；打扫' },
  'try': { phonetic: '/traɪ/', translation: '尝试；努力' },
  'try your best': { phonetic: '/traɪ jɔː(r) best/', translation: '尽你最大努力' },
  'unit': { phonetic: '/ˈjuːnɪt/', translation: '单位；单元' },
  'up': { phonetic: '/ʌp/', translation: '向上；朝上' },
  'volleyball': { phonetic: '/ˈvɒlibɔːl/', translation: '排球' },
  'wash': { phonetic: '/wɒʃ/', translation: '洗；洗涤' },
  'year': { phonetic: '/jɪə(r)/', translation: '年；年份' },
};

async function getWordInfo(word: string): Promise<{ phonetic: string; translation: string }> {
  const lowerWord = word.toLowerCase();

  if (wordDictionary[lowerWord]) {
    return wordDictionary[lowerWord];
  }

  const isPhrase = word.includes(' ');
  let phonetic = '';
  let translation = '';

  const apis = [
    () => fetchFromCDICT(word),
    () => fetchFromWebDict(word),
    () => fetchFromFreeDict(word),
  ];

  for (const api of apis) {
    const data = await api();
    if (data.phonetic && !phonetic) {
      phonetic = data.phonetic;
    }
    if (data.translation && !translation) {
      translation = data.translation;
    }
    if (phonetic && translation) {
      break;
    }
  }

  if (!phonetic && isPhrase) {
    const words = word.split(' ');
    const phonetics: string[] = [];
    
    for (const w of words) {
      const lowerW = w.toLowerCase();
      if (wordDictionary[lowerW]) {
        const clean = wordDictionary[lowerW].phonetic.replace(/[\/()]/g, '').trim();
        if (clean) phonetics.push(clean);
      } else {
        const data = await fetchFromFreeDict(w);
        if (data.phonetic) {
          const clean = data.phonetic.replace(/[\/()]/g, '').trim();
          if (clean) phonetics.push(clean);
        }
      }
    }

    if (phonetics.length > 0) {
      phonetic = `/${phonetics.join(' ')}/`;
    }
  }

  if (!translation && isPhrase) {
    for (const w of lowerWord.split(' ')) {
      if (wordDictionary[w] && !translation) {
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
