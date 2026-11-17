import { cn } from "@/lib/utils";
import type { ActivityDay } from "@/types/study";

interface ActivityHeatmapProps {
  days: ActivityDay[];
  maxCount: number;
}

function levelClass(count: number, maxCount: number): string {
  if (count <= 0) return "bg-secondary";
  const ratio = maxCount > 0 ? count / maxCount : 0;
  if (ratio <= 0.25) return "bg-emerald-200";
  if (ratio <= 0.5) return "bg-emerald-400";
  if (ratio <= 0.75) return "bg-emerald-600";
  return "bg-emerald-800";
}

/** GitHub 风格学习热力图：7 行 × 若干列，每格代表一天 */
export function ActivityHeatmap({ days, maxCount }: ActivityHeatmapProps) {
  if (days.length === 0) return null;

  const [year, month, day] = days[0].date.split("-").map(Number);
  const startWeekday = new Date(year, month - 1, day).getDay();

  const weeks: (ActivityDay | null)[][] = [];
  let current: (ActivityDay | null)[] = Array.from({ length: startWeekday }, () => null);
  for (const item of days) {
    current.push(item);
    if (current.length === 7) {
      weeks.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    while (current.length < 7) current.push(null);
    weeks.push(current);
  }

  return (
    <div className="overflow-x-auto pb-1">
      <div
        className="grid grid-flow-col gap-1"
        style={{ gridTemplateRows: "repeat(7, 12px)", width: "max-content" }}
      >
        {weeks.flatMap((week, weekIndex) =>
          week.map((item, dayIndex) => (
            <div
              key={`${weekIndex}-${dayIndex}`}
              title={item ? `${item.date}：${item.count} 个单词` : undefined}
              className={cn(
                "h-3 w-3 rounded-sm",
                item ? levelClass(item.count, maxCount) : "bg-transparent"
              )}
            />
          ))
        )}
      </div>
    </div>
  );
}
