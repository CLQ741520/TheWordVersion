import axios from 'axios';

import { fileToBase64 } from '@/utils/fileToBase64';

export interface OcrWord {
  words: string;
  probability?: { average: number; variance: number; min: number };
}

export interface OcrResult {
  log_id: number;
  direction?: number;
  words_result_num: number;
  words_result: OcrWord[];
  error_code?: number;
  error_msg?: string;
}

export async function recognizeImage(imageBase64: string): Promise<OcrResult> {
  const response = await axios.post('/api/ocr', { imageBase64 });

  const data = response.data;

  if (data.error) {
    throw new Error(data.error);
  }

  return data;
}

/** 上传 Excel / Word / PDF / TXT，由后端提取纯文本 */
export async function extractTextFromFile(file: File): Promise<string> {
  const fileBase64 = await fileToBase64(file);
  try {
    const response = await axios.post('/api/extract-text', {
      fileName: file.name,
      fileBase64,
    });
    const text = response.data?.text;
    if (typeof text !== 'string') throw new Error('文件解析失败');
    return text;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.error;
      if (typeof message === 'string' && message) throw new Error(message);
    }
    throw error instanceof Error ? error : new Error('文件解析失败');
  }
}
