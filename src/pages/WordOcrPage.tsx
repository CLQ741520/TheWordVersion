import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { FileImage, Loader2, Trash2, Upload, FileDown, ScanLine, BookPlus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { fileToBase64, validateImage } from "@/utils/fileToBase64";
import { extractEnglishWords, type ExtractedWord } from "@/utils/extractWords";
import { exportWordInfoToXlsx } from "@/utils/exportXlsx";
import { recognizeImage } from "@/services/ocrService";
import { fetchWordInfo, type WordInfo } from "@/services/wordInfoService";
import { addWordsToWordbook, fetchWordbookWords } from "@/services/wordbookService";
import { saveRecognitionRecord } from "@/services/studyService";

interface PreviewFile {
  id: string;
  file: File;
  preview: string;
}

export const WordOcrPage: React.FC = () => {
  const [files, setFiles] = useState<PreviewFile[]>([]);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [results, setResults] = useState<WordInfo[]>([]);
  const [existingWords, setExistingWords] = useState<Set<string>>(new Set());
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    fetchWordbookWords()
      .then((words) => setExistingWords(new Set(words.map((word) => word.toLowerCase()))))
      .catch(() => {
        // 生词本标记失败不影响识别主流程
      });
  }, []);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles: PreviewFile[] = [];
    for (const file of acceptedFiles) {
      const validation = validateImage(file);
      if (!validation.valid) {
        toast.error(validation.message);
        continue;
      }
      newFiles.push({
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        preview: URL.createObjectURL(file),
      });
    }
    if (newFiles.length > 0) {
      setFiles((prev) => [...prev, ...newFiles]);
    }
  }, []);

  const onDropRejected = useCallback((fileRejections: FileRejection[]) => {
    for (const rejection of fileRejections) {
      const errors = rejection.errors.map((e) => e.message).join("；");
      toast.error(`文件「${rejection.file.name}」被拒绝：${errors}`);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    accept: {
      "image/*": [".jpeg", ".jpg", ".png", ".bmp", ".webp"],
    },
    multiple: true,
  });

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const handleRecognize = useCallback(async () => {
    if (files.length === 0) {
      toast.error("请先上传至少一张图片");
      return;
    }

    setIsRecognizing(true);
    setResults([]);
    const toastId = toast.loading("正在识别图片中的单词，请稍候…");

    const allWords: ExtractedWord[] = [];
    const perImageResults: { imageName: string; imageSize: number; words: string[] }[] = [];
    let failedCount = 0;

    try {
      for (const item of files) {
        try {
          const base64 = await fileToBase64(item.file);
          const ocrResult = await recognizeImage(base64);
          const texts = ocrResult.words_result.map((w) => w.words);
          const words = extractEnglishWords(texts);
          allWords.push(...words);
          perImageResults.push({
            imageName: item.file.name,
            imageSize: item.file.size,
            words: words.map((word) => word.text),
          });
        } catch (itemErr) {
          failedCount++;
          const itemMessage = itemErr instanceof Error ? itemErr.message : "未知错误";
          toast.error(`图片「${item.file.name}」识别失败：${itemMessage}`);
        }
      }

      if (allWords.length === 0) {
        if (failedCount > 0) {
          toast.error("所有图片均识别失败，请检查图片内容或网络后重试", { id: toastId });
        } else {
          toast.success("图片中未识别到任何英文单词，请确认图片包含英语内容", { id: toastId });
        }
        return;
      }

      if (failedCount > 0) {
        toast.warning(`${failedCount} 张图片识别失败，已跳过`, { id: toastId });
      } else {
        toast.loading(`已识别 ${allWords.length} 个单词和词组，正在查询释义…`, { id: toastId });
      }

      const wordTexts = allWords.map(w => w.text);
      const wordInfos = await fetchWordInfo(wordTexts);

      // 图片里本来就有中译时优先使用图片中的释义，避免被词典翻译覆盖
      const originalMeanings = new Map<string, string>();
      for (const word of allWords) {
        if (!word.translation) continue;
        const key = word.text.toLowerCase();
        if (!originalMeanings.has(key)) originalMeanings.set(key, word.translation);
      }
      const mergedInfos = wordInfos.map((info) => {
        const original = originalMeanings.get(info.word.toLowerCase());
        return original ? { ...info, translation: original } : info;
      });

      setResults(mergedInfos);
      setSelectedWords(
        new Set(
          mergedInfos
            .filter((info) => !existingWords.has(info.word.toLowerCase()))
            .map((info) => info.word)
        )
      );
      toast.success(`成功识别并查询 ${wordInfos.length} 个单词和词组`, { id: toastId });

      // 识别记录写入数据库，供后续统计与历史追溯
      void Promise.allSettled(
        perImageResults.map((record) =>
          saveRecognitionRecord({ ...record, status: "success" })
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "识别过程出现未知错误";
      toast.error(message, { id: toastId });
    } finally {
      setIsRecognizing(false);
    }
  }, [files, existingWords]);

  const selectableWords = useMemo(
    () => results.filter((item) => !existingWords.has(item.word.toLowerCase())).map((item) => item.word),
    [results, existingWords]
  );

  const allSelectableSelected =
    selectableWords.length > 0 && selectableWords.every((word) => selectedWords.has(word));

  const toggleSelectAll = useCallback(
    (checked: boolean) => {
      setSelectedWords(checked ? new Set(selectableWords) : new Set());
    },
    [selectableWords]
  );

  const toggleSelectWord = useCallback((word: string, checked: boolean) => {
    setSelectedWords((prev) => {
      const next = new Set(prev);
      if (checked) next.add(word);
      else next.delete(word);
      return next;
    });
  }, []);

  const handleAddSelected = useCallback(async () => {
    const selectedItems = results.filter((item) => selectedWords.has(item.word));
    if (selectedItems.length === 0) {
      toast.error("请先勾选要收录的单词");
      return;
    }

    setIsAdding(true);
    try {
      const result = await addWordsToWordbook(
        selectedItems.map((item) => ({
          word: item.word,
          phonetic: item.phonetic,
          translation: item.translation,
        })),
        "ocr"
      );
      if (result.added > 0) {
        toast.success(`已收录 ${result.added} 个单词到生词本`);
      }
      if (result.skipped > 0) {
        toast.info(`有 ${result.skipped} 个单词已在生词本中`);
      }
      setExistingWords((prev) => {
        const next = new Set(prev);
        for (const item of selectedItems) next.add(item.word.toLowerCase());
        return next;
      });
      setSelectedWords(new Set());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "收录到生词本失败");
    } finally {
      setIsAdding(false);
    }
  }, [results, selectedWords]);

  const handleExport = useCallback(() => {
    if (results.length === 0) {
      toast.error("暂无可导出的识别结果");
      return;
    }
    exportWordInfoToXlsx(results);
    toast.success("表格已导出");
  }, [results]);

  const hasResults = results.length > 0;

  const tableRows = useMemo(
    () =>
      results.map((item, index) => {
        const isExisting = existingWords.has(item.word.toLowerCase());
        return (
          <TableRow key={`${item.word}-${index}`}>
            <TableCell>
              <Checkbox
                checked={isExisting || selectedWords.has(item.word)}
                disabled={isExisting}
                onCheckedChange={(checked) => toggleSelectWord(item.word, checked === true)}
                aria-label={`选择 ${item.word}`}
              />
            </TableCell>
            <TableCell className="font-medium">{item.word}</TableCell>
            <TableCell className="text-muted-foreground font-mono">{item.phonetic || "-"}</TableCell>
            <TableCell>{item.translation || "-"}</TableCell>
            <TableCell>
              {isExisting ? (
                <Badge variant="success">已收录</Badge>
              ) : (
                <Badge variant="outline">待收录</Badge>
              )}
            </TableCell>
          </TableRow>
        );
      }),
    [results, existingWords, selectedWords, toggleSelectWord]
  );

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-4 py-8 md:py-12">
        <header className="mb-8 md:mb-12">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl text-balance">
            单词图片识别工具
          </h1>
          <p className="mt-2 text-sm text-muted-foreground md:text-base max-w-prose">
            上传包含英语单词的图片，自动识别并生成「单词 / 音标 / 中译」表格，支持识别词组；勾选后可一键收录到生词本，继续复习和测验。
          </p>
        </header>

        <Card className="border border-border bg-card">
          <CardContent className="p-4 md:p-6">
            <div
              {...getRootProps()}
              className={`
                cursor-pointer rounded-lg border border-dashed border-border bg-secondary/30
                px-4 py-8 text-center transition-colors hover:bg-secondary/60 md:py-12
                ${isDragActive ? "border-primary bg-primary/5" : ""}
              `}
            >
              <input {...getInputProps()} />
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Upload className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="mt-4 text-sm font-medium">拖拽图片到此处，或点击选择图片</p>
              <p className="mt-1 text-xs text-muted-foreground">支持 JPG、PNG、BMP、WebP，单张不超过 10MB</p>
            </div>

            {files.length > 0 && (
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {files.map((item) => (
                  <div
                    key={item.id}
                    className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted"
                  >
                    <img
                      src={item.preview}
                      alt={item.file.name}
                      className="h-full w-full object-cover"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      onClick={() => removeFile(item.id)}
                      className="absolute right-2 top-2 h-7 w-7 rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="删除图片"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3 md:flex-row">
              <Button
                onClick={handleRecognize}
                disabled={isRecognizing || files.length === 0}
                className="w-full md:w-auto"
              >
                {isRecognizing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ScanLine className="mr-2 h-4 w-4" />
                )}
                {isRecognizing ? "识别中…" : "开始识别"}
              </Button>

              <Button
                onClick={handleAddSelected}
                disabled={
                  !hasResults || isRecognizing || isAdding || selectedWords.size === 0
                }
                className="w-full md:w-auto"
              >
                {isAdding ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <BookPlus className="mr-2 h-4 w-4" />
                )}
                收录选中{selectedWords.size > 0 ? `（${selectedWords.size}）` : ""}
              </Button>

              <Button
                variant="secondary"
                onClick={handleExport}
                disabled={!hasResults || isRecognizing}
                className="w-full md:w-auto"
              >
                <FileDown className="mr-2 h-4 w-4" />
                导出表格
              </Button>
            </div>
          </CardContent>
        </Card>

        {hasResults && (
          <section className="mt-8 md:mt-12">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-lg font-medium tracking-tight">单词表格</h2>
              <p className="text-xs text-muted-foreground">
                已收录 {results.length - selectableWords.length} / {results.length}，勾选后可一键加入生词本
              </p>
            </div>
            <Card className="border border-border bg-card overflow-hidden">
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allSelectableSelected}
                          disabled={selectableWords.length === 0}
                          onCheckedChange={(checked) => toggleSelectAll(checked === true)}
                          aria-label="全选待收录单词"
                        />
                      </TableHead>
                      <TableHead className="whitespace-nowrap">单词/词组</TableHead>
                      <TableHead className="whitespace-nowrap">音标</TableHead>
                      <TableHead className="whitespace-nowrap">中译</TableHead>
                      <TableHead className="whitespace-nowrap">生词本</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>{tableRows}</TableBody>
                </Table>
              </div>
            </Card>
          </section>
        )}

        {!hasResults && !isRecognizing && (
          <div className="mt-12 flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-secondary/20 py-12 text-center">
            <FileImage className="h-10 w-10 text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">上传图片并点击「开始识别」即可生成表格</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default WordOcrPage;
