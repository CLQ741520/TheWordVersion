import axios from "axios";

import type {
  RecognitionDetail,
  RecognitionListResponse,
} from "@/types/recognition";

const API_BASE = "/api";

function toErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.error;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

export interface RecognitionQuery {
  q?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchRecognitionRecords(
  query: RecognitionQuery = {}
): Promise<RecognitionListResponse> {
  try {
    const response = await axios.get(`${API_BASE}/recognition`, {
      params: {
        q: query.q || undefined,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
      },
    });
    return response.data;
  } catch (error) {
    throw new Error(toErrorMessage(error, "获取识别历史失败"));
  }
}

export async function fetchRecognitionDetail(id: number): Promise<RecognitionDetail> {
  try {
    const response = await axios.get(`${API_BASE}/recognition/${id}`);
    return response.data;
  } catch (error) {
    throw new Error(toErrorMessage(error, "获取识别详情失败"));
  }
}
