import type { ReactNode } from "react";

import WordOcrPage from "./pages/WordOcrPage";
import HistoryPage from "./pages/HistoryPage";
import WordbookPage from "./pages/WordbookPage";
import ReviewPage from "./pages/ReviewPage";
import QuizPage from "./pages/QuizPage";
import StatsPage from "./pages/StatsPage";

export interface RouteConfig {
  name: string;
  path: string;
  element: ReactNode;
  visible?: boolean;
  /** Accessible without login. Routes without this flag require authentication. Has no effect when RouteGuard is not in use. */
  public?: boolean;
}

export const routes: RouteConfig[] = [
  {
    name: "单词图片识别",
    path: "/",
    element: <WordOcrPage />,
    public: true,
  },
  {
    name: "识别历史",
    path: "/history",
    element: <HistoryPage />,
    public: true,
  },
  {
    name: "我的生词本",
    path: "/wordbook",
    element: <WordbookPage />,
    public: true,
  },
  {
    name: "复习",
    path: "/review",
    element: <ReviewPage />,
    public: true,
  },
  {
    name: "测验",
    path: "/quiz",
    element: <QuizPage />,
    public: true,
  },
  {
    name: "学习统计",
    path: "/stats",
    element: <StatsPage />,
    public: true,
  },
];
