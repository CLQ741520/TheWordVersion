export type WordbookStatus = "learning" | "mastered";

export interface WordbookItem {
  id: number;
  word: string;
  phonetic: string;
  translation: string;
  source: string;
  status: WordbookStatus;
  repetitions: number;
  ease: number;
  interval_days: number;
  due_at: string | null;
  last_review_at: string | null;
  review_count: number;
  correct_count: number;
  wrong_count: number;
  created_at: string;
  updated_at: string;
}

export interface WordbookListResponse {
  items: WordbookItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AddWordbookResult {
  success: boolean;
  added: number;
  skipped: number;
  items: WordbookItem[];
}

export interface ReviewQueueResponse {
  items: WordbookItem[];
  dueCount: number;
  totalCount: number;
}

export type ReviewQuality = 0 | 1 | 2;

export interface ReviewNextState {
  repetitions: number;
  ease: number;
  interval_days: number;
  due_at: string;
  status: WordbookStatus;
}

export type QuizType = "en2zh" | "zh2en";

export interface QuizQuestion {
  id: number;
  word: string;
  phonetic: string;
  translation: string;
  type: QuizType;
  prompt: string;
  answer: string;
  options: string[];
}

export interface QuizResponse {
  questions: QuizQuestion[];
  message?: string;
}

export interface StudyRecord {
  word: string;
  action: string;
  quality: number | null;
  created_at: string;
}

export interface TopWrongWord {
  word: string;
  phonetic: string;
  translation: string;
  wrong_count: number;
}

export interface StatsResponse {
  wordbookTotal: number;
  masteredCount: number;
  learningCount: number;
  dueCount: number;
  todayStudied: number;
  todayAdded: number;
  totalAdded: number;
  practiceTotal: number;
  accuracy: number;
  masteryRate: number;
  streakDays: number;
  last14Days: { date: string; count: number }[];
  topWrongWords: TopWrongWord[];
  recentRecords: StudyRecord[];
}
