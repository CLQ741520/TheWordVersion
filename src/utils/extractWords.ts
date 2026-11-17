export interface ExtractedWord {
  text: string;
  isPhrase: boolean;
  /** 图片中该单词旁边已有的中译（优先于词典翻译） */
  translation?: string;
}

const stopWords = new Set([
  'a', 'an', 'the', 'of', 'to', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while', 'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom', 'its', 'their', 'my', 'your', 'his', 'her', 'our', 'we', 'you', 'they', 'i', 'he', 'she', 'it', 'me', 'him', 'us', 'them', 'sb', 'sth'
]);

const phraseStopWords = new Set([
  ...stopWords, 'up', 'out', 'off', 'over', 'down', 'away', 'back', 'about', 'against', 'around', 'behind', 'beside', 'beyond', 'inside', 'outside', 'toward', 'within', 'without'
]);

const CHINESE_MEANING_RE = /[一-龥][一-龥\s，。；、：""''（）()·…—\-]*/g;
const HEADER_WORDS_RE = /^(单词|英语|词汇|课文|练习|单元|姓名|班级|unit|lesson)/i;

/** 从一段 OCR 文本中取出图片里已有的中文释义 */
function extractChineseMeaning(text: string): string {
  const matches = text.match(CHINESE_MEANING_RE);
  if (!matches) return "";

  const meaning = matches
    .join("")
    .replace(/\s+/g, "")
    .replace(/[，。；、：·…—\-]+$/g, "")
    .trim();

  if (!meaning || meaning.length > 24) return "";
  // 表头/标题类中文不应被当成单词释义
  if (HEADER_WORDS_RE.test(meaning)) return "";
  return meaning;
}

export function extractEnglishWords(texts: string[]): ExtractedWord[] {
  const words: ExtractedWord[] = [];
  const seen = new Map<string, ExtractedWord>();
  let lastEnglishPhrase = "";

  const save = (word: string, isPhrase: boolean, translation?: string) => {
    const key = word.toLowerCase();
    const existing = seen.get(key);
    if (!existing) {
      const item: ExtractedWord = { text: word, isPhrase };
      if (translation) item.translation = translation;
      seen.set(key, item);
      words.push(item);
      return;
    }
    if (translation && !existing.translation) {
      existing.translation = translation;
    }
  };

  const tokenize = (segment: string): string[] =>
    segment
      .split(/\s+/)
      .map((token) => token.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "").toLowerCase())
      .filter((token) => token && /^[a-zA-Z'-]+$/.test(token));

  for (const text of texts) {
    const trimmedText = text.trim();
    if (!trimmedText) continue;

    const segments = trimmedText.split(/[\r\n]+/);

    for (const segment of segments) {
      const trimmed = segment.trim();
      if (!trimmed) continue;

      const meaning = extractChineseMeaning(trimmed);
      // 先去掉 /.../ 音标，避免音标里的字母被误认为单词
      const withoutPhonetic = trimmed.replace(/[/\[][^/\]]*[/\]]/g, " ");
      const cleanSegment = withoutPhonetic
        .replace(/[^a-zA-Z\s'-]/g, " ")
        .trim();

      // 纯中文行：作为上一行英文的原图中译
      if (!cleanSegment) {
        if (meaning && lastEnglishPhrase) {
          const phraseTokens = lastEnglishPhrase.split(/\s+/);
          if (phraseTokens.length <= 3) {
            save(lastEnglishPhrase, phraseTokens.length > 1, meaning);
          }
        }
        lastEnglishPhrase = "";
        continue;
      }

      const tokens = tokenize(cleanSegment);
      const contentTokens = tokens.filter((token) => token.length >= 2);
      // 本行英文最多 3 词时作为整体绑定中译，避免把释义错配给拆分出的每个单词
      const linePhrase =
        contentTokens.length > 0 && contentTokens.length <= 3 ? contentTokens.join(" ") : "";
      if (meaning && linePhrase) {
        save(linePhrase, contentTokens.length > 1, meaning);
      }
      lastEnglishPhrase = linePhrase;

      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.length < 2) continue;
        if (stopWords.has(token)) continue;
        save(token, false);
      }

      for (let i = 0; i < tokens.length - 1; i++) {
        const token1 = tokens[i];
        const token2 = tokens[i + 1];

        if (
          token1 && token2 &&
          token1.length >= 2 && token2.length >= 2
        ) {
          const hasValidContent = !phraseStopWords.has(token1) || !phraseStopWords.has(token2);
          if (!hasValidContent) continue;
          save(`${token1} ${token2}`, true);
        }
      }

      for (let i = 0; i < tokens.length - 2; i++) {
        const token1 = tokens[i];
        const token2 = tokens[i + 1];
        const token3 = tokens[i + 2];

        if (
          token1 && token2 && token3 &&
          token1.length >= 2 && token2.length >= 2 && token3.length >= 2
        ) {
          const validTokens = [token1, token2, token3].filter((t) => !phraseStopWords.has(t));
          if (validTokens.length < 2) continue;
          save(`${token1} ${token2} ${token3}`, true);
        }
      }
    }
  }

  return words.sort((a, b) => {
    if (a.isPhrase !== b.isPhrase) {
      return a.isPhrase ? 1 : -1;
    }
    return a.text.localeCompare(b.text);
  });
}
