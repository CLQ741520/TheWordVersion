import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { ActivityHeatmap } from "@/components/ActivityHeatmap";
import { MonthHeatmap } from "@/components/MonthHeatmap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { fetchActivity, fetchServerDate, fetchStats } from "@/services/studyService";
import type { ActivityResponse, StatsResponse } from "@/types/study";
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

const GOAL_PRESETS = [10, 20, 30, 50];

export default function StatsPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [activity, setActivity] = useState<ActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [dailyGoal, setDailyGoal] = useLocalStorage<number>("theword:daily-goal", 20);
  // 记录每日目标最近一次修改的北京时间日期，用于「每天只能改一次」的锁定
  const [goalLastChange, setGoalLastChange] = useLocalStorage<{
    date: string;
    goal: number;
  } | null>("theword:goal-last-change", null);
  const [networkDate, setNetworkDate] = useState("");
  const [customGoal, setCustomGoal] = useState(() => String(dailyGoal));
  const [goalSaving, setGoalSaving] = useState(false);
  const [selectedYear, setSelectedYear] = useState(() => String(new Date().getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsResult, activityResult] = await Promise.allSettled([
        fetchStats(),
        fetchActivity(730),
      ]);
      if (statsResult.status === "rejected") throw statsResult.reason;
      setStats(statsResult.value);
      if (activityResult.status === "fulfilled") {
        setActivity(activityResult.value);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "获取学习统计失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 进页面时取一次服务器北京时间；失败则保持空值，修改目标时会再次请求并提示
  useEffect(() => {
    let cancelled = false;
    void fetchServerDate()
      .then((date) => {
        if (!cancelled) setNetworkDate(date);
      })
      .catch(() => {
        // 网络异常时不阻塞页面展示
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const goalLocked = networkDate !== "" && goalLastChange?.date === networkDate;

  /** 修改每日目标：必须联网取到北京时间，且同一北京时间日期内只能改一次 */
  const applyGoal = async (value: number) => {
    if (goalSaving) return;
    const goal = Math.round(Number(value));
    if (!Number.isFinite(goal) || goal < 1 || goal > 999) {
      toast.error("请输入 1–999 之间的目标词数");
      return;
    }
    // 目标没变化不算一次修改，不消耗当天的修改机会
    if (goal === Math.max(1, Number(dailyGoal) || 1)) {
      toast.info(`当前目标已经是 ${goal} 词`);
      return;
    }
    setGoalSaving(true);
    try {
      let today: string;
      try {
        today = await fetchServerDate();
      } catch {
        toast.error("请先检查网络是否正常！");
        return;
      }
      if (goalLastChange?.date === today) {
        toast.error(`今天已经修改过目标（${goalLastChange.goal} 词），明天再调整吧`);
        return;
      }
      setDailyGoal(goal);
      setGoalLastChange({ date: today, goal });
      setNetworkDate(today);
      setCustomGoal(String(goal));
      toast.success(`每日目标已设为 ${goal} 词`);
    } finally {
      setGoalSaving(false);
    }
  };

  const years = useMemo(() => {
    const set = new Set((activity?.days ?? []).map((day) => day.date.slice(0, 4)));
    return [...set].sort().reverse().slice(0, 2);
  }, [activity]);

  useEffect(() => {
    if (years.length > 0 && !years.includes(selectedYear)) {
      setSelectedYear(years[0]);
      setSelectedMonth("");
    }
  }, [years, selectedYear]);

  const yearDays = useMemo(
    () => (activity?.days ?? []).filter((day) => day.date.startsWith(`${selectedYear}-`)),
    [activity, selectedYear]
  );

  const monthDays = useMemo(
    () => yearDays.filter((day) => day.date.startsWith(`${selectedYear}-${selectedMonth}`)),
    [yearDays, selectedYear, selectedMonth]
  );

  const viewDays = selectedMonth ? monthDays : yearDays;
  const viewTotal = viewDays.reduce((sum, day) => sum + day.count, 0);
  const viewActiveDays = viewDays.filter((day) => day.count > 0).length;
  const viewMaxCount = Math.max(...viewDays.map((day) => day.count), 1);

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

  const safeGoal = Math.max(1, Number(dailyGoal) || 1);
  const goalProgress = Math.min(100, Math.round((stats.todayStudied / safeGoal) * 100));

  const cards = [
    { label: "生词本总数", value: stats.wordbookTotal, hint: "已收录单词" },
    { label: "已掌握", value: stats.masteredCount, hint: `掌握率 ${percent(stats.masteryRate)}` },
    { label: "待复习", value: stats.dueCount, hint: "已到复习时间" },
    { label: "今日学习", value: stats.todayStudied, hint: `今日新收录 ${stats.todayAdded}` },
    { label: "连续学习", value: `${stats.streakDays} 天`, hint: "按学习记录计算" },
    { label: "答题正确率", value: percent(stats.accuracy), hint: `累计练习 ${stats.practiceTotal} 次` },
  ];

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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

      <div className="mt-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base">学习热力图</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedYear}
                onChange={(event) => {
                  setSelectedYear(event.target.value);
                  setSelectedMonth("");
                }}
                className="h-9 rounded-md border border-input bg-background px-2 text-[14px]"
                aria-label="选择年份"
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year} 年
                  </option>
                ))}
              </select>
              <select
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-[14px]"
                aria-label="选择月份"
              >
                <option value="">全年</option>
                {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0")).map(
                  (month) => (
                    <option key={month} value={month}>
                      {Number(month)} 月
                    </option>
                  )
                )}
              </select>
            </div>
          </CardHeader>
          <CardContent>
            {viewDays.length > 0 ? (
              <>
                {selectedMonth ? (
                  <ActivityHeatmap days={monthDays} maxCount={viewMaxCount} fill cellSize={52} />
                ) : (
                  <MonthHeatmap year={selectedYear} days={yearDays} />
                )}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {selectedMonth ? `${Number(selectedMonth)} 月` : `${selectedYear} 年`}累计学习{" "}
                    {viewTotal} 词次 · 活跃 {viewActiveDays} 天
                  </span>
                  <span className="flex items-center gap-1">
                    少
                    <span className="inline-block h-3 w-3 rounded-sm bg-secondary" />
                    <span className="inline-block h-3 w-3 rounded-sm bg-emerald-200" />
                    <span className="inline-block h-3 w-3 rounded-sm bg-emerald-400" />
                    <span className="inline-block h-3 w-3 rounded-sm bg-emerald-600" />
                    <span className="inline-block h-3 w-3 rounded-sm bg-emerald-800" />
                    多
                  </span>
                </div>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">还没有学习记录</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">每日学习目标</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-3xl font-semibold tracking-tight">
                  {stats.todayStudied}
                  <span className="text-base font-normal text-muted-foreground"> / {safeGoal}</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">今日已练习（不含新收录）</p>
              </div>
              <Badge variant={goalProgress >= 100 ? "success" : "secondary"}>
                {goalProgress}%
              </Badge>
            </div>
            <Progress value={goalProgress} className="mt-4" />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {GOAL_PRESETS.map((preset) => (
                <Button
                  key={preset}
                  size="sm"
                  variant={safeGoal === preset ? "default" : "outline"}
                  disabled={goalLocked || goalSaving}
                  onClick={() => void applyGoal(preset)}
                >
                  {preset} 词
                </Button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={999}
                inputMode="numeric"
                value={customGoal}
                onChange={(event) => setCustomGoal(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void applyGoal(Number(customGoal));
                }}
                placeholder="自定义词数"
                aria-label="自定义每日目标词数"
                disabled={goalLocked || goalSaving}
                className="h-9 w-28 text-[14px]"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={goalLocked || goalSaving || !customGoal.trim()}
                onClick={() => void applyGoal(Number(customGoal))}
              >
                设置目标
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {goalLocked
                ? "今日已修改过目标，明天可再次调整。"
                : "每天只能修改一次，按联网北京时间计算。"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base">高频错词 Top 10</CardTitle>
          {stats.topWrongWords.length > 0 && (
            <Button asChild variant="outline" size="sm">
              <Link to="/review?mode=wrong">专项复习</Link>
            </Button>
          )}
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
