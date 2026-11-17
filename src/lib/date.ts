export interface DueLabel {
  text: string;
  overdue: boolean;
}

/** 把数据库的 "YYYY-MM-DD HH:mm:ss" 格式转为便于阅读的复习时间文案 */
export function formatDueLabel(due: string | null): DueLabel {
  if (!due) return { text: "-", overdue: false };
  const date = new Date(due.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return { text: due, overdue: false };

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((dueStart.getTime() - todayStart.getTime()) / 86400000);
  const pad = (n: number) => String(n).padStart(2, "0");

  if (diffDays < 0) return { text: "待复习", overdue: true };
  if (diffDays === 0) {
    return { text: `今天 ${pad(date.getHours())}:${pad(date.getMinutes())}`, overdue: false };
  }
  if (diffDays === 1) return { text: "明天", overdue: false };
  return { text: `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`, overdue: false };
}

/** 把间隔天数转为文案 */
export function formatInterval(days: number): string {
  if (days <= 0) return "今天";
  if (days === 1) return "明天";
  return `${days} 天后`;
}
