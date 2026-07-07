import { supabase } from "@/db/supabase";

export interface OcrWord {
  words: string;
  probability?: { average: number; variance: number; min: number };
}

export interface OcrResult {
  log_id: number;
  direction?: number;
  words_result_num: number;
  words_result: OcrWord[];
  error_code: number;
  error_msg: string;
}

/**
 * 调用 Edge Function 进行高精度 OCR 识别。
 */
export async function recognizeImage(imageBase64: string): Promise<OcrResult> {
  const { data, error } = await supabase.functions.invoke<OcrResult>("accurate-ocr", {
    body: { image: imageBase64, language_type: "CHN_ENG" },
  });

  if (error) {
    const errorMsg = await error.context?.text();
    throw new Error(errorMsg || error.message || "OCR 识别失败");
  }

  if (!data) {
    throw new Error("OCR 未返回结果");
  }

  if (data.error_code !== 0) {
    throw new Error(`OCR 识别出错：${data.error_msg}`);
  }

  return data;
}
