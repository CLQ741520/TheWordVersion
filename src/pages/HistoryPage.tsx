import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, History, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { fetchRecognitionDetail, fetchRecognitionRecords } from "@/services/recognitionService";
import { addWordsToWordbook } from "@/services/wordbookService";
import type { RecognitionDetail, RecognitionListItem } from "@/types/recognition";

const PAGE_SIZE = 15;

function formatSize(bytes: number): string {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function HistoryPage() {
  const [items, setItems] = useState<RecognitionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<RecognitionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchRecognitionRecords({ q: debouncedQ, page, pageSize: PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        toast.error(error instanceof Error ? error.message : "获取识别历史失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQ, page, refreshKey]);

  const openDetail = async (item: RecognitionListItem) => {
    setDetailOpen(true);
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await fetchRecognitionDetail(item.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "获取识别详情失败");
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAddAll = async () => {
    if (!detail) return;
    const pending = detail.words.filter((word) => !word.inWordbook);
    if (pending.length === 0) {
      toast.info("这些单词都已在生词本中");
      return;
    }
    setAdding(true);
    try {
      const result = await addWordsToWordbook(
        pending.map((item) => ({ word: item.word })),
        "ocr"
      );
      toast.success(
        result.added > 0 ? `已收录 ${result.added} 个单词` : "这些单词都已在生词本中"
      );
      setDetail(await fetchRecognitionDetail(detail.id));
      setRefreshKey((key) => key + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "收录失败");
    } finally {
      setAdding(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">识别历史</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            共 {total} 条识别记录，可回看每次识别出的单词。
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/">
            <Plus className="mr-2 h-4 w-4" />
            去识别图片
          </Link>
        </Button>
      </header>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="按图片文件名搜索…"
              className="pl-9"
            />
          </div>

          <div className="mt-4 overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">图片文件</TableHead>
                  <TableHead className="whitespace-nowrap">大小</TableHead>
                  <TableHead className="whitespace-nowrap">单词数</TableHead>
                  <TableHead className="whitespace-nowrap">状态</TableHead>
                  <TableHead className="whitespace-nowrap">识别时间</TableHead>
                  <TableHead className="w-28">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {item.image_name || "-"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatSize(item.image_size)}
                    </TableCell>
                    <TableCell>{item.word_count}</TableCell>
                    <TableCell>
                      <Badge variant={item.status === "success" ? "success" : "destructive"}>
                        {item.status === "success" ? "成功" : "失败"}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {item.created_at}
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => void openDetail(item)}>
                        查看单词
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载中…
            </div>
          )}

          {!loading && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <History className="h-10 w-10 text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">
                {debouncedQ ? "没有符合条件的识别记录" : "还没有识别记录，去识别几张单词图片吧"}
              </p>
              {!debouncedQ && (
                <Button asChild variant="outline" className="mt-4">
                  <Link to="/">去识别单词</Link>
                </Button>
              )}
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                第 {page} / {totalPages} 页
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  下一页
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detail?.imageName || "识别详情"}</DialogTitle>
            <DialogDescription>
              {detail
                ? `${detail.createdAt} · 共 ${detail.words.length} 个单词`
                : "正在加载识别结果…"}
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载中…
            </div>
          ) : detail && detail.words.length > 0 ? (
            <div className="max-h-[55vh] overflow-y-auto">
              <div className="flex flex-wrap gap-2">
                {detail.words.map((item) => (
                  <span
                    key={item.word}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-sm",
                      item.inWordbook
                        ? "bg-secondary text-muted-foreground"
                        : "bg-emerald-50 text-emerald-700"
                    )}
                    title={item.inWordbook ? "已在生词本中" : "尚未收录"}
                  >
                    {item.word}
                    {item.inWordbook && <span className="ml-1 text-xs">已收录</span>}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                绿色为尚未收录的单词，可一键加入生词本。
              </p>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              这条记录没有识别到单词
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>
              关闭
            </Button>
            <Button
              onClick={() => void handleAddAll()}
              disabled={adding || detailLoading || !detail || detail.words.every((w) => w.inWordbook)}
            >
              {adding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              全部加入生词本
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
