import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ListChecks, Loader2, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { fetchQuiz, submitQuizResult } from "@/services/studyService";
import type { QuizQuestion } from "@/types/study";
import { cn } from "@/lib/utils";

type Phase = "idle" | "playing" | "result";
type QuizMode = "choice" | "spelling";

interface Answer {
  id: number;
  correct: boolean;
}

const QUIZ_SIZE = 10;

function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export default function QuizPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [quizMode, setQuizMode] = useState<QuizMode>("choice");
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [spellingInput, setSpellingInput] = useState("");
  const [composing, setComposing] = useState(false);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [emptyMessage, setEmptyMessage] = useState("");

  const startQuiz = useCallback(async () => {
    setLoading(true);
    setEmptyMessage("");
    try {
      const result = await fetchQuiz(QUIZ_SIZE, quizMode);
      if (result.questions.length === 0) {
        setEmptyMessage(result.message || "暂时无法生成测验");
        setPhase("idle");
        return;
      }
      setQuestions(result.questions);
      setIndex(0);
      setSelected(null);
      setSpellingInput("");
      setAnswers([]);
      setPhase("playing");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成测验失败");
    } finally {
      setLoading(false);
    }
  }, [quizMode]);

  const current = phase === "playing" ? questions[index] : null;

  const choose = (option: string) => {
    if (!current || selected !== null) return;
    setSelected(option);
    setAnswers((prev) => [...prev, { id: current.id, correct: option === current.answer }]);
  };

  const submitSpelling = () => {
    if (!current || selected !== null || !spellingInput.trim()) return;
    const correct = normalizeAnswer(spellingInput) === normalizeAnswer(current.answer);
    setSelected(spellingInput);
    setAnswers((prev) => [...prev, { id: current.id, correct }]);
  };

  // 点击提示后直接放弃：记为答错，进入错词队列，且不可回退
  const giveUp = () => {
    if (!current || selected !== null || current.type !== "spelling") return;
    setSelected("__give_up__");
    setAnswers((prev) => [...prev, { id: current.id, correct: false }]);
  };

  const next = async () => {
    if (!current) return;
    if (index + 1 < questions.length) {
      setIndex((i) => i + 1);
      setSelected(null);
      setSpellingInput("");
      return;
    }

    try {
      await submitQuizResult(answers);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存测验结果失败");
    }
    setPhase("result");
  };

  useEffect(() => {
    if (!current || selected !== null || current.type === "spelling") return;
    const handler = (event: KeyboardEvent) => {
      const position = Number.parseInt(event.key, 10);
      if (position >= 1 && position <= current.options.length) {
        choose(current.options[position - 1]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  if (phase === "idle") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Card>
          <CardContent className="flex flex-col items-center px-6 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
              <ListChecks className="h-6 w-6" />
            </div>
            <h1 className="mt-4 text-lg font-semibold">单词测验</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              从生词本随机抽取最多 {QUIZ_SIZE} 个单词。答错的单词会自动回到复习队列。
            </p>
            <div className="mt-5 flex gap-2">
              <Button
                size="sm"
                variant={quizMode === "choice" ? "default" : "outline"}
                onClick={() => setQuizMode("choice")}
              >
                选择题
              </Button>
              <Button
                size="sm"
                variant={quizMode === "spelling" ? "default" : "outline"}
                onClick={() => setQuizMode("spelling")}
              >
                拼写题
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {quizMode === "choice"
                ? "英译中 / 中译英混排，适合快速复习。"
                : "看中文写英文，检验拼写掌握程度。"}
            </p>
            {emptyMessage && <p className="mt-4 text-sm text-amber-700">{emptyMessage}</p>}
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button asChild variant="outline">
                <Link to="/wordbook">查看生词本</Link>
              </Button>
              <Button onClick={() => void startQuiz()} disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ListChecks className="mr-2 h-4 w-4" />
                )}
                开始测验
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === "result") {
    const correctCount = answers.filter((answer) => answer.correct).length;
    const wrongQuestions = questions.filter(
      (question) => answers.find((answer) => answer.id === question.id)?.correct === false
    );
    const score = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;

    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Card>
          <CardContent className="px-6 py-10">
            <div className="flex flex-col items-center text-center">
              <div
                className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-full",
                  score >= 60 ? "bg-emerald-100" : "bg-amber-100"
                )}
              >
                {score >= 60 ? (
                  <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                ) : (
                  <XCircle className="h-7 w-7 text-amber-600" />
                )}
              </div>
              <h1 className="mt-4 text-xl font-semibold">得分 {score} 分</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                共 {questions.length} 题，答对 {correctCount} 题，答错 {questions.length - correctCount} 题。
              </p>
            </div>

            {wrongQuestions.length > 0 && (
              <div className="mt-8">
                <h2 className="text-sm font-medium">错题回顾</h2>
                <div className="mt-3 space-y-2">
                  {wrongQuestions.map((question) => (
                    <div key={question.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{question.word}</span>
                        <Badge variant="destructive">答错</Badge>
                      </div>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {question.phonetic || "-"}
                      </p>
                      <p className="mt-1 text-sm">{question.translation}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        正确答案：{question.answer}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  错题已自动加入复习队列，可以马上去复习巩固。
                </p>
              </div>
            )}

            <div className="mt-8 flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" className="flex-1" onClick={() => void startQuiz()} disabled={loading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                再来一组
              </Button>
              <Button asChild className="flex-1">
                <Link to="/review?mode=wrong">去复习错题</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!current) return null;

  const isAnswered = selected !== null;
  const isCorrect =
    selected !== null &&
    (current.type === "spelling"
      ? normalizeAnswer(selected) === normalizeAnswer(current.answer)
      : selected === current.answer);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">测验</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            第 {index + 1} / {questions.length} 题
          </p>
        </div>
        <Badge variant="secondary">
          {current.type === "spelling" ? "拼写" : current.type === "en2zh" ? "英译中" : "中译英"}
        </Badge>
      </header>

      <Progress value={((index + (isAnswered ? 1 : 0)) / questions.length) * 100} className="mb-6" />

      <Card>
        <CardContent className="px-6 py-8">
          <p className="text-center text-3xl font-semibold tracking-tight md:text-4xl">
            {current.prompt}
          </p>
          {current.type === "en2zh" && current.phonetic && (
            <p className="mt-2 text-center font-mono text-sm text-muted-foreground">
              {current.phonetic}
            </p>
          )}

          {current.type === "spelling" ? (
            <div className="mt-8">
              <Input
                value={spellingInput}
                onChange={(event) => setSpellingInput(event.target.value)}
                onCompositionStart={() => setComposing(true)}
                onCompositionEnd={() => setComposing(false)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !composing && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    submitSpelling();
                  }
                }}
                placeholder="输入英文单词后按回车"
                disabled={isAnswered}
                autoFocus
                className="text-center text-lg"
              />
              {!isAnswered && (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Button
                    className="flex-1"
                    onClick={submitSpelling}
                    disabled={!spellingInput.trim()}
                  >
                    提交答案
                  </Button>
                  <Button variant="outline" className="text-[18px]" onClick={giveUp}>
                    提示
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-8 grid gap-2">
              {current.options.map((option, optionIndex) => {
                const isPicked = selected === option;
                const isAnswer = option === current.answer;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => choose(option)}
                    disabled={isAnswered}
                    className={cn(
                      "flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                      !isAnswered && "hover:bg-accent",
                      isAnswered && isAnswer && "border-emerald-300 bg-emerald-50 text-emerald-800",
                      isAnswered && isPicked && !isAnswer && "border-red-300 bg-red-50 text-red-800",
                      isAnswered && !isPicked && !isAnswer && "opacity-60"
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs">
                        {optionIndex + 1}
                      </span>
                      {option}
                    </span>
                    {isAnswered && isAnswer && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                    {isAnswered && isPicked && !isAnswer && <XCircle className="h-4 w-4 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          {isAnswered && (
            <div className="mt-6">
              <p
                className={cn(
                  "text-center text-sm font-medium",
                  isCorrect ? "text-emerald-700" : "text-red-700"
                )}
              >
                {isCorrect ? "回答正确" : `回答错误，正确答案：${current.answer}`}
              </p>
              {current.type === "spelling" && (
                <p className="mt-1 text-center text-sm text-muted-foreground">
                  {selected === "__give_up__" ? "已标记为不熟悉" : `你的答案：${selected}`}
                </p>
              )}
              <Button className="mt-4 w-full" onClick={() => void next()}>
                {index + 1 < questions.length ? "下一题" : "查看结果"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="mt-4 text-center text-[21px] text-muted-foreground">
        {current.type === "spelling"
          ? "输入答案后按回车提交"
          : "按数字键 1-4 可以快速选择答案"}
      </p>
    </div>
  );
}
