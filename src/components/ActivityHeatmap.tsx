import { cn } from "@/lib/utils";
import type { ActivityDay } from "@/types/study";

interface ActivityHeatmapProps {
  days: ActivityDay[];
  maxCount: number;
  /** 单格边长（px），默认 12；月视图可传更大的值 */
  cellSize?: number;
  /** 铺满容器宽度：列宽等分、格子高度固定，避免窄网格右侧大片留白 */
  fill?: boolean;
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
export function ActivityHeatmap({
  days,
  maxCount,
  cellSize = 12,
  fill = false,
}: ActivityHeatmapProps) {
  if (days.length === 0) return null;

  // 按实际日期升序排列，避免调用方顺序影响布局
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const [year, month] = sorted[0].date.split("-").map(Number);
  // 以当月 1 号定位行：第 1 行固定周日，依次到第 7 行周六
  const startWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const countByDate = new Map(sorted.map((item) => [item.date, item]));
  const pad = (value: number) => String(value).padStart(2, "0");
  // 本月只画到今天，历史月份画到月末
  const monthEnd = `${year}-${pad(month)}-${pad(daysInMonth)}`;
  const lastDate = sorted[sorted.length - 1].date;
  const endDay = Number((lastDate < monthEnd ? lastDate : monthEnd).slice(8, 10));

  const cells: (ActivityDay | null)[] = Array.from({ length: startWeekday }, () => null);
  for (let d = 1; d <= endDay; d += 1) {
    const date = `${year}-${pad(month)}-${pad(d)}`;
    cells.push(countByDate.get(date) ?? { date, count: 0 });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (ActivityDay | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }

  // 列 = 星期：第一列周日、第二列周一 …… 第七列周六；每行是一周
  const weekLabels = ["日", "一", "二", "三", "四", "五", "六"];
  const gap = fill ? 6 : 4;
  const labelFontSize = Math.max(12, Math.min(14, fill ? 14 : cellSize - 4));

  return (
    <div className={cn("pb-1", fill ? "w-full" : "overflow-x-auto")}>
      <div
        className={cn("grid", fill && "w-full")}
        style={{
          gridTemplateColumns: fill ? "repeat(7, minmax(0, 1fr))" : `repeat(7, ${cellSize}px)`,
          gap,
        }}
      >
        {weekLabels.map((label) => (
          <div
            key={label}
            className="text-center text-muted-foreground"
            style={{ fontSize: labelFontSize }}
          >
            {label}
          </div>
        ))}
        {weeks.flatMap((week, weekIndex) =>
          week.map((item, dayIndex) => (
            <div
              key={`${weekIndex}-${dayIndex}`}
              title={item ? `${item.date}：${item.count} 个单词` : undefined}
              className={cn(
                "rounded-sm",
                fill && "w-full",
                item ? levelClass(item.count, maxCount) : "bg-transparent"
              )}
              style={fill ? { height: cellSize } : { width: cellSize, height: cellSize }}
            />
          ))
        )}
      </div>
    </div>
  );
}
