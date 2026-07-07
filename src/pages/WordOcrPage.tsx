import React, { useCallback, useMemo, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { FileImage, Loader2, Trash2, Upload, FileDown, ScanLine } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { fileToBase64, validateImage } from "@/utils/fileToBase64";
import { extractEnglishWords } from "@/utils/extractWords";
import { exportWordInfoToCsv } from "@/utils/exportCsv";
import { recognizeImage } from "@/services/ocrService";
import { fetchWordInfo, type WordInfo } from "@/services/wordInfoService";
import { DEMO_IMAGE_BASE64 } from "@/utils/demoImage";

interface PreviewFile {
  id: string;
  file: File;
  preview: string;
}

export const WordOcrPage: React.FC = () => {
  const [files, setFiles] = useState<PreviewFile[]>([]);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [results, setResults] = useState<WordInfo[]>([]);
  const [rawTexts, setRawTexts] = useState<string[]>([]);

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

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
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
    setRawTexts([]);
    const toastId = toast.loading("正在识别图片中的单词，请稍候…");

    const allWords: string[] = [];
    const allRawTexts: string[] = [];
    let failedCount = 0;

    try {
      for (const item of files) {
        try {
          console.log(`[OCR] 开始处理图片: ${item.file.name}`);
          const base64 = await fileToBase64(item.file);
          console.log(`[OCR] 图片转 Base64 完成, 长度: ${base64.length}`);
          const ocrResult = await recognizeImage(base64);
          console.log(`[OCR] 识别结果:`, ocrResult);
          const texts = ocrResult.words_result.map((w) => w.words);
          allRawTexts.push(...texts);
          const words = extractEnglishWords(texts);
          console.log(`[OCR] 提取单词 [${item.file.name}]:`, words);
          allWords.push(...words);
        } catch (itemErr) {
          failedCount++;
          console.error(`[OCR] 图片「${item.file.name}」处理异常:`, itemErr);
          const itemMessage = itemErr instanceof Error ? itemErr.message : "未知错误";
          toast.error(`图片「${item.file.name}」识别失败：${itemMessage}`);
        }
      }

      setRawTexts(allRawTexts);

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
        toast.loading(`已识别 ${allWords.length} 个单词，正在查询释义…`, { id: toastId });
      }

      const wordInfos = await fetchWordInfo(allWords);
      console.log(`[OCR] 单词信息查询完成:`, wordInfos);

      setResults(wordInfos);
      toast.success(`成功识别并查询 ${wordInfos.length} 个单词`, { id: toastId });
    } catch (err) {
      console.error("[OCR] 整体流程异常:", err);
      const message = err instanceof Error ? err.message : "识别过程出现未知错误";
      toast.error(message, { id: toastId });
    } finally {
      setIsRecognizing(false);
    }
  }, [files]);

  const handleDemoTest = useCallback(async () => {
    setIsRecognizing(true);
    setResults([]);
    setRawTexts([]);
    const toastId = toast.loading("正在使用示例图片测试 OCR 链路…");

    try {
      const ocrResult = await recognizeImage(DEMO_IMAGE_BASE64);
      console.log("[OCR] 示例测试识别结果:", ocrResult);
      const texts = ocrResult.words_result.map((w) => w.words);
      setRawTexts(texts);
      const words = extractEnglishWords(texts);
      console.log("[OCR] 示例提取单词:", words);

      if (words.length === 0) {
        toast.success("示例图片未提取到英文单词，但 OCR 识别正常", { id: toastId });
        return;
      }

      toast.loading(`示例已识别 ${words.length} 个单词，正在查询释义…`, { id: toastId });
      const wordInfos = await fetchWordInfo(words);
      setResults(wordInfos);
      toast.success(`示例测试成功：共 ${wordInfos.length} 个单词`, { id: toastId });
    } catch (err) {
      console.error("[OCR] 示例测试异常:", err);
      const message = err instanceof Error ? err.message : "示例测试失败";
      toast.error(message, { id: toastId });
    } finally {
      setIsRecognizing(false);
    }
  }, []);

  const handleExport = useCallback(() => {
    if (results.length === 0) {
      toast.error("暂无可导出的识别结果");
      return;
    }
    exportWordInfoToCsv(results);
    toast.success("表格已导出");
  }, [results]);

  const hasResults = results.length > 0;

  const tableRows = useMemo(
    () =>
      results.map((item, index) => (
        <TableRow key={`${item.word}-${index}`}>
          <TableCell className="font-medium">{item.word}</TableCell>
          <TableCell className="text-muted-foreground font-mono">{item.phonetic || "-"}</TableCell>
          <TableCell>{item.translation || "-"}</TableCell>
        </TableRow>
      )),
    [results]
  );

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-4 py-8 md:py-12">
        <header className="mb-8 md:mb-12">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl text-balance">
            单词图片识别工具
          </h1>
          <p className="mt-2 text-sm text-muted-foreground md:text-base max-w-prose">
            上传包含英语单词的图片，自动识别内容并生成「单词 / 音标 / 中译」表格。
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
                variant="outline"
                onClick={handleDemoTest}
                disabled={isRecognizing}
                className="w-full md:w-auto"
              >
                <FileImage className="mr-2 h-4 w-4" />
                使用示例测试
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

        {(hasResults || rawTexts.length > 0) && (
          <section className="mt-8 md:mt-12 space-y-6">
            {rawTexts.length > 0 && (
              <div>
                <h2 className="mb-2 text-lg font-medium tracking-tight">原始识别文本</h2>
                <Card className="border border-border bg-card p-4">
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {rawTexts.map((t, i) => (
                      <li key={i} className="break-words">• {t}</li>
                    ))}
                  </ul>
                </Card>
              </div>
            )}

            {hasResults && (
              <div>
                <h2 className="mb-4 text-lg font-medium tracking-tight">单词表格</h2>
                <Card className="border border-border bg-card overflow-hidden">
                  <div className="w-full overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="whitespace-nowrap">单词</TableHead>
                          <TableHead className="whitespace-nowrap">音标</TableHead>
                          <TableHead className="whitespace-nowrap">中译</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>{tableRows}</TableBody>
                    </Table>
                  </div>
                </Card>
              </div>
            )}
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
