import type { WordInfo } from "@/services/wordInfoService";

/**
 * 将单词信息数组导出为 UTF-8 编码的 CSV 文件。
 */
export function exportWordInfoToCsv(words: WordInfo[]): void {
  if (words.length === 0) return;

  const header = ["单词", "音标", "中译"];
  const rows = words.map((item) => [
    escapeCsvField(item.word),
    escapeCsvField(item.phonetic),
    escapeCsvField(item.translation),
  ]);

  const csvContent = [header, ...rows].map((row) => row.join(",")).join("\n");
  const bom = "\uFEFF";
  const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `单词识别结果_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function escapeCsvField(value: string): string {
  if (!value) return "";
  const escaped = value.replace(/"/g, '""');
  if (escaped.includes(",") || escaped.includes('"') || escaped.includes("\n")) {
    return `"${escaped}"`;
  }
  return escaped;
}
