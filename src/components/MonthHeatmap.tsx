import { cn } from "@/lib/utils";
import type { ActivityDay } from "@/types/study";

interface MonthHeatmapProps {
  year: string;
  days: ActivityDay[];
}

function levelClass(count: number, maxCount: number): string {
  if (count <= 0) return "bg-secondary text-secondary-foreground";
  const ratio = maxCount > 0 ? count / maxCount : 0;
  if (ratio <= 0.25) return "bg-emerald-200 text-emerald-950";
  if (ratio <= 0.5) return "bg-emerald-400 text-emerald-950";
  if (ratio <= 0.75) return "bg-emerald-600 text-white";
  return "bg-emerald-800 text-white";
}

/** 年度视图：12 个月的学习量汇总色块 */
export function MonthHeatmap({ year, days }: MonthHeatmapProps) {
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, "0");
    const monthDays = days.filter((day) => day.date.startsWith(`${year}-${month}`));
    return {
      month: index + 1,
      count: monthDays.reduce((sum, day) => sum + day.count, 0),
      activeDays: monthDays.filter((day) => day.count > 0).length,
    };
  });
  const maxCount = Math.max(...months.map((item) => item.count), 1);

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
      {months.map((item) => (
        <div
          key={item.month}
          title={`${year} 年 ${item.month} 月：${item.count} 词次`}
          className={cn(
            "rounded-md px-2 py-3 text-center",
            levelClass(item.count, maxCount)
          )}
        >
          <div className="text-xs font-medium">{item.month} 月</div>
          <div className="mt-1 text-base font-semibold">{item.count}</div>
          <div className="text-xs opacity-80">{item.activeDays} 天</div>
        </div>
      ))}
    </div>
  );
}
