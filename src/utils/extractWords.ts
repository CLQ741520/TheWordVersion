export interface ExtractedWord {
  text: string;
  isPhrase: boolean;
}

const stopWords = new Set([
  'a', 'an', 'the', 'of', 'to', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while', 'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom', 'its', 'their', 'my', 'your', 'his', 'her', 'our', 'we', 'you', 'they', 'i', 'he', 'she', 'it', 'me', 'him', 'us', 'them', 'sb', 'sth'
]);

const phraseStopWords = new Set([
  ...stopWords, 'up', 'out', 'off', 'over', 'down', 'away', 'back', 'about', 'against', 'around', 'behind', 'beside', 'beyond', 'inside', 'outside', 'toward', 'within', 'without'
]);

export function extractEnglishWords(texts: string[]): ExtractedWord[] {
  const words: ExtractedWord[] = [];
  const seen = new Set<string>();

  for (const text of texts) {
    const trimmed = text.trim();
    if (!trimmed) continue;

    const segments = trimmed.split(/[\r\n]+/);

    for (const segment of segments) {
      const cleanSegment = segment
        .replace(/[^a-zA-Z\s'-]/g, " ")
        .trim();

      if (!cleanSegment) continue;

      const tokens = cleanSegment.split(/\s+/);

      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i].replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "").toLowerCase();
        if (!token || !/^[a-zA-Z'-]+$/.test(token)) continue;
        if (token.length < 2) continue;
        if (stopWords.has(token)) continue;

        const lowerToken = token.toLowerCase();
        if (!seen.has(lowerToken)) {
          seen.add(lowerToken);
          words.push({ text: token, isPhrase: false });
        }
      }

      for (let i = 0; i < tokens.length - 1; i++) {
        const token1 = tokens[i].replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "").toLowerCase();
        const token2 = tokens[i + 1].replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "").toLowerCase();
        
        if (token1 && token2 && 
            /^[a-zA-Z'-]+$/.test(token1) && /^[a-zA-Z'-]+$/.test(token2) &&
            token1.length >= 2 && token2.length >= 2) {
          
          const hasValidContent = !phraseStopWords.has(token1) || !phraseStopWords.has(token2);
          if (!hasValidContent) continue;

          const phrase = `${token1} ${token2}`;
          if (!seen.has(phrase)) {
            seen.add(phrase);
            words.push({ text: phrase, isPhrase: true });
          }
        }
      }

      for (let i = 0; i < tokens.length - 2; i++) {
        const token1 = tokens[i].replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "").toLowerCase();
        const token2 = tokens[i + 1].replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "").toLowerCase();
        const token3 = tokens[i + 2].replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "").toLowerCase();
        
        if (token1 && token2 && token3 && 
            /^[a-zA-Z'-]+$/.test(token1) && 
            /^[a-zA-Z'-]+$/.test(token2) && 
            /^[a-zA-Z'-]+$/.test(token3) &&
            token1.length >= 2 && token2.length >= 2 && token3.length >= 2) {

          const validTokens = [token1, token2, token3].filter(t => !phraseStopWords.has(t));
          if (validTokens.length < 2) continue;

          const phrase = `${token1} ${token2} ${token3}`;
          if (!seen.has(phrase)) {
            seen.add(phrase);
            words.push({ text: phrase, isPhrase: true });
          }
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
