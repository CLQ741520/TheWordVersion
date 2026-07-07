import { supabase } from "@/db/supabase";

export interface WordInfo {
  word: string;
  phonetic: string;
  translation: string;
}

export interface WordInfoResponse {
  result: WordInfo[];
}

/**
 * 批量查询单词的音标与中文翻译。
 */
export async function fetchWordInfo(words: string[]): Promise<WordInfo[]> {
  const { data, error } = await supabase.functions.invoke<WordInfoResponse>("word-info", {
    body: { words },
  });

  if (error) {
    const errorMsg = await error.context?.text();
    throw new Error(errorMsg || error.message || "单词查询失败");
  }

  if (!data) {
    throw new Error("单词查询未返回结果");
  }

  return data.result ?? [];
}
