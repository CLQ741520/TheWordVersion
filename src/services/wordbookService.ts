import axios from "axios";

import type {
  AddWordbookResult,
  WordbookItem,
  WordbookListResponse,
  WordbookStatus,
} from "@/types/study";

const API_BASE = "/api";

function toErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.error;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

export interface WordbookQuery {
  q?: string;
  status?: WordbookStatus | "";
  page?: number;
  pageSize?: number;
}

export async function fetchWordbook(query: WordbookQuery = {}): Promise<WordbookListResponse> {
  try {
    const response = await axios.get(`${API_BASE}/wordbook`, {
      params: {
        q: query.q || undefined,
        status: query.status || undefined,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
      },
    });
    return response.data;
  } catch (error) {
    throw new Error(toErrorMessage(error, "获取生词本失败"));
  }
}

export async function fetchWordbookWords(): Promise<string[]> {
  try {
    const response = await axios.get(`${API_BASE}/wordbook/words`);
    return Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    throw new Error(toErrorMessage(error, "获取生词本单词失败"));
  }
}

export interface AddWordInput {
  word: string;
  phonetic?: string;
  translation?: string;
  source?: string;
}

export async function addWordsToWordbook(
  words: AddWordInput[],
  source = "manual"
): Promise<AddWordbookResult> {
  try {
    const response = await axios.post(`${API_BASE}/wordbook`, { words, source });
    return response.data;
  } catch (error) {
    throw new Error(toErrorMessage(error, "收录到生词本失败"));
  }
}

export async function updateWordbookItem(
  id: number,
  patch: {
    phonetic?: string;
    translation?: string;
    status?: WordbookStatus;
    resetProgress?: boolean;
  }
): Promise<WordbookItem> {
  try {
    const response = await axios.patch(`${API_BASE}/wordbook/${id}`, patch);
    return response.data.item;
  } catch (error) {
    throw new Error(toErrorMessage(error, "更新单词失败"));
  }
}

export async function deleteWordbookItem(id: number): Promise<void> {
  try {
    await axios.delete(`${API_BASE}/wordbook/${id}`);
  } catch (error) {
    throw new Error(toErrorMessage(error, "删除单词失败"));
  }
}

export async function deleteWordbookItems(ids: number[]): Promise<void> {
  try {
    await axios.post(`${API_BASE}/wordbook/batch-delete`, { ids });
  } catch (error) {
    throw new Error(toErrorMessage(error, "批量删除失败"));
  }
}

/** 按当前筛选条件拉取全部单词（用于导出） */
export async function fetchAllWordbookWords(query: WordbookQuery = {}): Promise<WordbookItem[]> {
  const pageSize = 200;
  const first = await fetchWordbook({ ...query, page: 1, pageSize });
  const items = [...first.items];
  const totalPages = Math.ceil(first.total / pageSize);
  for (let page = 2; page <= totalPages; page++) {
    const next = await fetchWordbook({ ...query, page, pageSize });
    items.push(...next.items);
  }
  return items;
}
