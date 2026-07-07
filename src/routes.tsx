import WordOcrPage from './pages/WordOcrPage';
import type { ReactNode } from 'react';

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
    name: '单词图片识别',
    path: '/',
    element: <WordOcrPage />,
    public: true,
  }
];
