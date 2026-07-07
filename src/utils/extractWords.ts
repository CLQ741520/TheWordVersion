/**
 * 从 OCR 识别出的原始文本中提取英文单词。
 * 按空格、换行、常见标点分割，过滤非字母字符并统一小写。
 */
export function extractEnglishWords(texts: string[]): string[] {
  const words: string[] = [];
  for (const text of texts) {
    const segments = text
      .replace(/[\r\n]+/g, " ")
      .replace(/[^a-zA-Z\s'-]/g, " ")
      .split(/\s+/);
    for (const segment of segments) {
      const cleaned = segment
        .replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "")
        .toLowerCase();
      if (cleaned.length > 0 && /^[a-zA-Z'-]+$/.test(cleaned)) {
        words.push(cleaned);
      }
    }
  }
  return words;
}
