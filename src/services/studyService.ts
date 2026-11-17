import axios from "axios";

import type {
  ActivityResponse,
  QuizResponse,
  ReviewNextState,
  ReviewQuality,
  ReviewQueueMode,
  ReviewQueueResponse,
  StatsResponse,
} from "@/types/study";

const API_BASE = "/api";

function toErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.error;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

/** 获取服务器北京时间日期（YYYY-MM-DD），用于每日目标修改校验 */
export async function fetchServerDate(): Promise<string> {
  try {
    const response = await axios.get(`${API_BASE}/time`);
    const date = response.data?.beijingDate;
    if (typeof date !== "string" || !date) throw new Error("invalid response");
    return date;
  } catch (error) {
    throw new Error(toErrorMessage(error, "请先检查网络是否正常！"));
  }
}

export async function fetchReviewQueue(
  limit = 50,
  mode: ReviewQueueMode = "due"
): Promise<ReviewQueueResponse> {
  try {
    const response = await axios.get(`${API_BASE}/review/queue`, { params: { limit, mode } });
    return response.data;
  } catch (error) {
    throw new Error(toErrorMessage(error, "获取复习队列失败"));
  }
}

export async function submitReview(id: number, quality: ReviewQuality): Promise<ReviewNextState> {
  try {
    const response = await axios.post(`${API_BASE}/review/${id}`, { quality });
    return response.data.next;
  } catch (error) {
    throw new Error(toErrorMessage(error, "提交复习结果失败"));
  }
}

export async function fetchQuiz(
  limit = 10,
  mode: "choice" | "spelling" = "choice"
): Promise<QuizResponse> {
  try {
    const response = await axios.get(`${API_BASE}/quiz`, { params: { limit, mode } });
    return response.data;
  } catch (error) {
    throw new Error(toErrorMessage(error, "生成测验失败"));
  }
}

export async function submitQuizResult(
  results: { id: number; correct: boolean }[]
): Promise<void> {
  try {
    await axios.post(`${API_BASE}/quiz/result`, { results });
  } catch (error) {
    throw new Error(toErrorMessage(error, "保存测验结果失败"));
  }
}

export async function fetchStats(): Promise<StatsResponse> {
  try {
    const response = await axios.get(`${API_BASE}/stats`);
    return response.data;
  } catch (error) {
    throw new Error(toErrorMessage(error, "获取学习统计失败"));
  }
}

export async function fetchActivity(days = 365): Promise<ActivityResponse> {
  try {
    const response = await axios.get(`${API_BASE}/stats/activity`, { params: { days } });
    return response.data;
  } catch (error) {
    throw new Error(toErrorMessage(error, "获取学习活跃度失败"));
  }
}

export async function saveRecognitionRecord(payload: {
  imageName: string;
  imageSize: number;
  words: string[];
  status: string;
}): Promise<void> {
  try {
    await axios.post(`${API_BASE}/recognition`, payload);
  } catch (error) {
    // 识别记录保存失败不阻塞主流程，仅在控制台留痕
    console.warn("保存识别记录失败:", error);
  }
}
