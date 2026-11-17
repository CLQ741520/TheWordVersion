import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, Eye, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatDueLabel } from "@/lib/date";
import { fetchReviewQueue, submitReview } from "@/services/studyService";
import type { ReviewNextState, ReviewQuality, ReviewQueueMode, WordbookItem } from "@/types/study";

interface Tally {
  known: number;
  fuzzy: number;
  forgot: number;
}

interface LastFeedback {
  word: string;
  next: ReviewNextState;
}

const EMPTY_TALLY: Tally = { known: 0, fuzzy: 0, forgot: 0 };

export default function ReviewPage() {
  const [searchParams] = useSearchParams();
  const mode: ReviewQueueMode = searchParams.get("mode") === "wrong" ? "wrong" : "due";
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<WordbookItem[]>([]);
  const [dueCount, setDueCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tally, setTally] = useState<Tally>(EMPTY_TALLY);
  const [lastFeedback, setLastFeedback] = useState<LastFeedback | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchReviewQueue(50, mode);
      setQueue(result.items);
      setDueCount(result.dueCount);
      setTotalCount(result.totalCount);
      setIndex(0);
      setRevealed(false);
      setTally(EMPTY_TALLY);
      setLastFeedback(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "获取复习队列失败");
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    void load();
  }, [load]);

  const finished = index >= queue.length;
  const current = finished ? null : queue[index];

  const handleQuality = useCallback(
    async (quality: ReviewQuality) => {
      if (!current || submitting) return;
      setSubmitting(true);
      try {
        const next = await submitReview(current.id, quality);
        setLastFeedback({ word: current.word, next });
        setTally((prev) => ({
          known: prev.known + (quality === 2 ? 1 : 0),
          fuzzy: prev.fuzzy + (quality === 1 ? 1 : 0),
          forgot: prev.forgot + (quality === 0 ? 1 : 0),
        }));
        setIndex((i) => i + 1);
        setRevealed(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "提交复习结果失败");
      } finally {
        setSubmitting(false);
      }
    },
    [current, submitting]
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!current || submitting) return;
      if (event.code === "Space") {
        event.preventDefault();
        if (!revealed) setRevealed(true);
        return;
      }
      if (revealed && (event.key === "1" || event.key === "2" || event.key === "3")) {
        void handleQuality((Number(event.key) - 1) as ReviewQuality);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [current, revealed, submitting, handleQuality]);

  const progress = queue.length > 0 ? (Math.min(index, queue.length) / queue.length) * 100 : 0;

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        正在加载复习队列…
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Card>
          <CardContent className="flex flex-col items-center px-6 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
              <Check className="h-6 w-6 text-emerald-600" />
            </div>
            <h1 className="mt-4 text-lg font-semibold">
              {mode === "wrong" ? "暂无错词" : "暂无到期单词"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "wrong"
                ? "先去做一组测验，答错的单词会自动进入这里。"
                : totalCount === 0
                  ? "生词本还是空的，先去识别页面收录一些单词吧。"
                  : "所有单词都在计划中，等下次到期后再来复习即可。"}
            </p>
            <div className="mt-6 flex gap-2">
              <Button asChild variant="outline">
                <Link to="/wordbook">查看生词本</Link>
              </Button>
              <Button asChild>
                <Link to={totalCount === 0 && mode === "due" ? "/" : "/quiz"}>
                  {totalCount === 0 && mode === "due" ? "去识别单词" : "去测验"}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (finished) {
    const correct = tally.known;
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Card>
          <CardContent className="px-6 py-10">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                <Sparkles className="h-6 w-6 text-emerald-600" />
              </div>
              <h1 className="mt-4 text-xl font-semibold">本轮复习完成</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                共复习 {queue.length} 个单词，其中 {correct} 个认识。
              </p>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border bg-emerald-50/60 p-4">
                <div className="text-2xl font-semibold text-emerald-700">{tally.known}</div>
                <div className="mt-1 text-xs text-emerald-700/80">认识</div>
              </div>
              <div className="rounded-lg border bg-amber-50/60 p-4">
                <div className="text-2xl font-semibold text-amber-700">{tally.fuzzy}</div>
                <div className="mt-1 text-xs text-amber-700/80">模糊</div>
              </div>
              <div className="rounded-lg border bg-red-50/60 p-4">
                <div className="text-2xl font-semibold text-red-700">{tally.forgot}</div>
                <div className="mt-1 text-xs text-red-700/80">忘记</div>
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" className="flex-1" onClick={() => void load()}>
                <RotateCcw className="mr-2 h-4 w-4" />
                再检查一轮
              </Button>
              <Button asChild className="flex-1">
                <Link to="/wordbook">返回生词本</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!current) return null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {mode === "wrong" ? "错词专项复习" : "复习"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "wrong" ? "错词" : "待复习"} {dueCount} 个 · 本轮{" "}
            {Math.min(index + 1, queue.length)} / {queue.length}
          </p>
        </div>
        <Badge variant={mode === "wrong" ? "destructive" : "secondary"}>
          {mode === "wrong" ? "错词强化" : "间隔重复"}
        </Badge>
      </header>

      <Progress value={progress} className="mb-6" />

      {lastFeedback && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-2.5 text-sm text-emerald-800">
          <span>
            「{lastFeedback.word}」下次复习：{formatDueLabel(lastFeedback.next.due_at).text}
          </span>
          <span className="text-xs text-emerald-700/80">
            间隔 {lastFeedback.next.interval_days} 天 ·{" "}
            {lastFeedback.next.status === "mastered" ? "已掌握" : "学习中"}
          </span>
        </div>
      )}

      <Card>
        <CardContent className="px-6 py-12">
          <div className="flex min-h-[200px] flex-col items-center justify-center text-center">
            <p className="text-4xl font-semibold tracking-tight md:text-5xl">{current.word}</p>
            {current.phonetic && (
              <p className="mt-2 font-mono text-sm text-muted-foreground">{current.phonetic}</p>
            )}

            {!revealed ? (
              <Button
                className="mt-[27px] h-[77px] min-w-[280px] px-10 text-lg"
                onClick={() => setRevealed(true)}
              >
                <Eye className="mr-2 h-4 w-4" />
                显示释义
                <span className="ml-1 text-xs opacity-70">（空格）</span>
              </Button>
            ) : (
              <div className="mt-8 w-full">
                <div className="rounded-lg border bg-secondary/40 p-5">
                  <p className="text-lg leading-relaxed">{current.translation || "暂无释义"}</p>
                </div>

                <p className="mt-6 text-xs text-muted-foreground">
                  根据回忆情况选择，会影响下次复习时间
                </p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Button
                    variant="outline"
                    className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                    disabled={submitting}
                    onClick={() => void handleQuality(0)}
                  >
                    忘记
                    <span className="ml-1 text-xs opacity-70">1</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                    disabled={submitting}
                    onClick={() => void handleQuality(1)}
                  >
                    模糊
                    <span className="ml-1 text-xs opacity-70">2</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    disabled={submitting}
                    onClick={() => void handleQuality(2)}
                  >
                    认识
                    <span className="ml-1 text-xs opacity-70">3</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        快捷键：空格显示释义，1 / 2 / 3 分别选择忘记 / 模糊 / 认识
      </p>
    </div>
  );
}
