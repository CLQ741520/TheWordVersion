import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileDown,
  FileSpreadsheet,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  addWordsToWordbook,
  deleteWordbookItem,
  deleteWordbookItems,
  fetchAllWordbookWords,
  fetchWordbook,
  updateWordbookItem,
} from "@/services/wordbookService";
import type { WordbookItem, WordbookStatus } from "@/types/study";
import { formatDueLabel as formatDue } from "@/lib/date";
import { exportClozeToXlsx, exportWordbookToXlsx } from "@/utils/exportXlsx";

const PAGE_SIZE = 15;

export default function WordbookPage() {
  const [items, setItems] = useState<WordbookItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState<WordbookStatus | "">("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [exporting, setExporting] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WordbookItem | null>(null);
  const [form, setForm] = useState({
    word: "",
    phonetic: "",
    translation: "",
    status: "learning" as WordbookStatus,
    resetProgress: false,
  });
  const [saving, setSaving] = useState(false);
  const [exportingCloze, setExportingCloze] = useState(false);

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
    fetchWordbook({ q: debouncedQ, status, page, pageSize: PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        toast.error(error instanceof Error ? error.message : "获取生词本失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQ, status, page, refreshKey]);

  useEffect(() => {
    setSelected(new Set());
  }, [debouncedQ, status, page, refreshKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const allSelected = items.length > 0 && selected.size === items.length;

  const toggleAll = useCallback(
    (checked: boolean) => {
      setSelected(checked ? new Set(items.map((item) => item.id)) : new Set());
    },
    [items]
  );

  const toggleOne = useCallback((id: number, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ word: "", phonetic: "", translation: "", status: "learning", resetProgress: false });
    setDialogOpen(true);
  };

  const openEdit = (item: WordbookItem) => {
    setEditing(item);
    setForm({
      word: item.word,
      phonetic: item.phonetic,
      translation: item.translation,
      status: item.status,
      resetProgress: false,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.word.trim()) {
      toast.error("请输入单词");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateWordbookItem(editing.id, {
          phonetic: form.phonetic.trim(),
          translation: form.translation.trim(),
          status: form.status,
          resetProgress: form.resetProgress,
        });
        toast.success(form.resetProgress ? "单词已更新并重置复习进度" : "单词已更新");
      } else {
        const result = await addWordsToWordbook(
          [
            {
              word: form.word.trim(),
              phonetic: form.phonetic.trim(),
              translation: form.translation.trim(),
            },
          ],
          "manual"
        );
        if (result.added > 0) toast.success("已加入生词本");
        else toast.warning("该单词已在生词本中");
      }
      setDialogOpen(false);
      setRefreshKey((key) => key + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: WordbookItem) => {
    if (!window.confirm(`确定从生词本删除「${item.word}」吗？`)) return;
    try {
      await deleteWordbookItem(item.id);
      toast.success("已删除");
      setRefreshKey((key) => key + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    }
  };

  const handleBatchDelete = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`确定删除选中的 ${selected.size} 个单词吗？`)) return;
    try {
      await deleteWordbookItems([...selected]);
      toast.success(`已删除 ${selected.size} 个单词`);
      setRefreshKey((key) => key + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量删除失败");
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const all = await fetchAllWordbookWords({ q: debouncedQ, status });
      if (all.length === 0) {
        toast.error("没有可导出的单词");
        return;
      }
      exportWordbookToXlsx(all);
      toast.success(`已导出 ${all.length} 个单词`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出失败");
    } finally {
      setExporting(false);
    }
  };

  const handleExportCloze = async () => {
    setExportingCloze(true);
    try {
      const all = await fetchAllWordbookWords({ q: debouncedQ, status });
      if (all.length === 0) {
        toast.error("没有可导出的单词");
        return;
      }
      exportClozeToXlsx(all);
      toast.success(`已生成 ${all.length} 个单词的挖空练习`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出挖空题失败");
    } finally {
      setExportingCloze(false);
    }
  };

  const rows = useMemo(
    () =>
      items.map((item) => {
        const due = formatDue(item.due_at);
        return (
          <TableRow key={item.id}>
            <TableCell>
              <Checkbox
                checked={selected.has(item.id)}
                onCheckedChange={(checked) => toggleOne(item.id, checked === true)}
                aria-label={`选择 ${item.word}`}
              />
            </TableCell>
            <TableCell className="font-medium whitespace-nowrap">{item.word}</TableCell>
            <TableCell className="font-mono text-muted-foreground whitespace-nowrap">
              {item.phonetic || "-"}
            </TableCell>
            <TableCell className="min-w-[160px]">{item.translation || "-"}</TableCell>
            <TableCell>
              <Badge variant={item.status === "mastered" ? "success" : "secondary"}>
                {item.status === "mastered" ? "已掌握" : "学习中"}
              </Badge>
            </TableCell>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {item.review_count} 次
              <span className="ml-1 text-xs">
                （{item.correct_count} 对 / {item.wrong_count} 错）
              </span>
            </TableCell>
            <TableCell className="whitespace-nowrap">
              {due.overdue ? (
                <Badge variant="warning">待复习</Badge>
              ) : (
                <span className="text-sm text-muted-foreground">{due.text}</span>
              )}
            </TableCell>
            <TableCell className="whitespace-nowrap">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => openEdit(item)} aria-label="编辑">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleDelete(item)}
                  aria-label="删除"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        );
      }),
    [items, selected, toggleOne]
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">我的生词本</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            共 {total} 个单词，支持搜索、编辑、导出与复习。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/review">
              <Sparkles className="mr-2 h-4 w-4" />
              去复习
            </Link>
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={exporting || total === 0}>
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="mr-2 h-4 w-4" />
            )}
            导出 Excel
          </Button>
          <Button
            variant="outline"
            onClick={handleExportCloze}
            disabled={exportingCloze || total === 0}
          >
            {exportingCloze ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="mr-2 h-4 w-4" />
            )}
            导出挖空题
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            新增单词
          </Button>
        </div>
      </header>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="搜索单词或释义…"
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as WordbookStatus | "");
                  setPage(1);
                }}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">全部状态</option>
                <option value="learning">学习中</option>
                <option value="mastered">已掌握</option>
              </select>
              <Button
                variant="outline"
                onClick={handleBatchDelete}
                disabled={selected.size === 0}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                删除选中{selected.size > 0 ? `（${selected.size}）` : ""}
              </Button>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={(checked) => toggleAll(checked === true)}
                      aria-label="全选当前页"
                    />
                  </TableHead>
                  <TableHead className="whitespace-nowrap">单词</TableHead>
                  <TableHead className="whitespace-nowrap">音标</TableHead>
                  <TableHead>中译</TableHead>
                  <TableHead className="whitespace-nowrap">状态</TableHead>
                  <TableHead className="whitespace-nowrap">复习进度</TableHead>
                  <TableHead className="whitespace-nowrap">下次复习</TableHead>
                  <TableHead className="w-24">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{rows}</TableBody>
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
              <BookOpen className="h-10 w-10 text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">
                {debouncedQ || status ? "没有符合条件的单词" : "生词本还是空的，去识别页面收录单词吧"}
              </p>
              {!debouncedQ && !status && (
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "编辑单词" : "新增单词"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "修改音标、释义或学习状态后保存；也可重置复习进度。"
                : "手动添加单词，音标和释义留空时会自动联网查询。"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="word-input" className="text-sm font-medium">
                单词 / 词组
              </label>
              <Input
                id="word-input"
                value={form.word}
                onChange={(event) => setForm((prev) => ({ ...prev, word: event.target.value }))}
                placeholder="例如：apple"
                disabled={Boolean(editing)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="phonetic-input" className="text-sm font-medium">
                音标（可选）
              </label>
              <Input
                id="phonetic-input"
                value={form.phonetic}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, phonetic: event.target.value }))
                }
                placeholder="例如：/ˈæpl/"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="translation-input" className="text-sm font-medium">
                中译（可选）
              </label>
              <Textarea
                id="translation-input"
                value={form.translation}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, translation: event.target.value }))
                }
                placeholder="例如：苹果"
                rows={3}
              />
            </div>
            {editing && (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="status-input" className="text-sm font-medium">
                    学习状态
                  </label>
                  <select
                    id="status-input"
                    value={form.status}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        status: event.target.value as WordbookStatus,
                      }))
                    }
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="learning">学习中</option>
                    <option value="mastered">已掌握</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    状态仅作标记，不会改变下次复习时间。
                  </p>
                </div>
                <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
                  <Checkbox
                    checked={form.resetProgress}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, resetProgress: checked === true }))
                    }
                    aria-label="重置复习进度"
                  />
                  <span>
                    重置复习进度
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      清空间隔重复记录并标记为学习中，该单词会重新进入复习队列。
                    </span>
                  </span>
                </label>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
