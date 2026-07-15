import axios from 'axios';

export interface WordInfo {
  id?: number;
  word: string;
  phonetic: string;
  translation: string;
  created_at?: Date;
}

const API_BASE = '/api';

export async function fetchWordInfo(words: string[]): Promise<WordInfo[]> {
  if (words.length === 0) return [];
  
  try {
    const response = await axios.get(`${API_BASE}/words`, {
      params: { words: words.join(',') },
    });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch word info:', error);
    return words.map(word => ({ word, phonetic: '', translation: '' }));
  }
}

export async function saveWordInfo(wordInfo: WordInfo): Promise<void> {
  try {
    await axios.post(`${API_BASE}/words`, [wordInfo]);
  } catch (error) {
    console.error('Failed to save word info:', error);
  }
}

export async function saveWordInfos(wordInfos: WordInfo[]): Promise<void> {
  try {
    await axios.post(`${API_BASE}/words`, wordInfos);
  } catch (error) {
    console.error('Failed to save word infos:', error);
  }
}
