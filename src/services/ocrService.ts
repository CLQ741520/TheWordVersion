import axios from 'axios';

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
