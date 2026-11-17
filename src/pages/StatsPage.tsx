import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchStats } from "@/services/studyService";
import type { StatsResponse } from "@/types/study";
import { cn } from "@/lib/utils";

const actionLabels: Record<string, string> = {
  add: "收录",
  review_known: "复习 · 认识",
  review_fuzzy: "复习 · 模糊",
  review_forgot: "复习 · 忘记",
  quiz_correct: "测验 · 答对",
  quiz_wrong: "测验 · 答错",
};

const actionStyles: Record<string, string> = {
  add: "bg-secondary text-secondary-foreground",
  review_known: "bg-emerald-100 text-emerald-700",
  review_fuzzy: "bg-amber-100 text-amber-700",
  review_forgot: "bg-red-100 text-red-700",
  quiz_correct: "bg-emerald-100 text-emerald-700",
  quiz_wrong: "bg-red-100 text-red-700",
};

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export default function StatsPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStats(await fetchStats());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "获取学习统计失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        正在统计学习数据…
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">统计数据加载失败</p>
        <Button className="mt-4" variant="outline" onClick={() => void load()}>
          重试
        </Button>
      </div>
    );
  }

  const cards = [
    { label: "生词本总数", value: stats.wordbookTotal, hint: "已收录单词" },
    { label: "已掌握", value: stats.masteredCount, hint: `掌握率 ${percent(stats.masteryRate)}` },
    { label: "待复习", value: stats.dueCount, hint: "已到复习时间" },
    { label: "今日学习", value: stats.todayStudied, hint: `今日新收录 ${stats.todayAdded}` },
    { label: "连续学习", value: `${stats.streakDays} 天`, hint: "按学习记录计算" },
    { label: "答题正确率", value: percent(stats.accuracy), hint: `累计练习 ${stats.practiceTotal} 次` },
  ];

  const maxActivity = Math.max(...stats.last14Days.map((day) => day.count), 1);
  const hasActivity = stats.last14Days.some((day) => day.count > 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">学习统计</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            收录 {stats.totalAdded} 次 · 累计练习 {stats.practiceTotal} 次
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          刷新
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">{card.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">近 14 天学习量</CardTitle>
          </CardHeader>
          <CardContent>
            {hasActivity ? (
              <div className="flex h-44 items-end gap-1.5">
                {stats.last14Days.map((day) => {
                  const height = Math.max(4, Math.round((day.count / maxActivity) * 100));
                  return (
                    <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
                      <div className="flex w-full flex-1 items-end">
                        <div
                          className="w-full rounded-t bg-primary/80 transition-all"
                          style={{ height: `${height}%` }}
                          title={`${day.date}：${day.count} 个单词`}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{day.date.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-44 flex-col items-center justify-center text-center">
                <BarChart3 className="h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">还没有学习记录</p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link to="/wordbook">去生词本开始学习</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">高频错词 Top 10</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.topWrongWords.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                暂无错词记录，继续保持。
              </p>
            ) : (
              <div className="space-y-2">
                {stats.topWrongWords.map((item, itemIndex) => (
                  <div
                    key={item.word}
                    className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs">
                        {itemIndex + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.word}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.translation || "-"}
                        </p>
                      </div>
                    </div>
                    <Badge variant="destructive" className="shrink-0">
                      错 {item.wrong_count} 次
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">最近学习记录</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.recentRecords.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">暂无学习记录</p>
          ) : (
            <div className="divide-y">
              {stats.recentRecords.map((record, recordIndex) => (
                <div
                  key={`${record.word}-${record.created_at}-${recordIndex}`}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={cn(
                        "shrink-0 rounded px-2 py-0.5 text-xs",
                        actionStyles[record.action] || "bg-secondary text-secondary-foreground"
                      )}
                    >
                      {actionLabels[record.action] || record.action}
                    </span>
                    <span className="truncate font-medium">{record.word}</span>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{record.created_at}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
