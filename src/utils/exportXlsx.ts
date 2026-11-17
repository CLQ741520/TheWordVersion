import type { WordInfo } from "@/services/wordInfoService";
import type { WordbookItem } from "@/types/study";
import * as XLSX from "xlsx-js-style";

export function exportWordInfoToXlsx(words: WordInfo[]): void {
  if (words.length === 0) return;

  const header = ["单词", "音标", "中译"];
  
  const data = words.map((item) => [
    item.word || "",
    item.phonetic || "",
    item.translation || "",
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet([header, ...data]);

  const headerCellStyle = {
    font: {
      name: "SimSun",
      sz: 20,
      bold: true,
    },
    alignment: {
      horizontal: "center",
      vertical: "center",
    },
    fill: {
      fgColor: { rgb: "E0E0E0" },
    },
    border: {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" },
    },
  };

  const dataCellStyle = {
    font: {
      name: "Times New Roman",
      sz: 20,
    },
    alignment: {
      horizontal: "left",
      vertical: "center",
      wrapText: true,
    },
    border: {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" },
    },
  };

  const chineseCellStyle = {
    font: {
      name: "SimSun",
      sz: 20,
    },
    alignment: {
      horizontal: "left",
      vertical: "center",
      wrapText: true,
    },
    border: {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" },
    },
  };

  const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:C1");
  
  for (let row = range.s.r; row <= range.e.r; row++) {
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      const cellValue = worksheet[cellAddress]?.v || "";
      
      if (row === 0) {
        worksheet[cellAddress].s = headerCellStyle;
      } else {
        if (col === 1) {
          // \u97f3\u6807\u5217\u56fa\u5b9a Times New Roman\uff0c\u4e0d\u53c2\u4e0e\u4e2d\u6587\u5224\u65ad
          worksheet[cellAddress].s = dataCellStyle;
        } else if (col === 2 && /[\u4e00-\u9fa5]/.test(cellValue.toString())) {
          worksheet[cellAddress].s = chineseCellStyle;
        } else {
          worksheet[cellAddress].s = dataCellStyle;
        }
      }
    }
  }

  const columnWidths = [
    { wch: Math.max(...[header[0], ...data.map((d) => d[0])].map((s) => calculateWidth(s))) },
    { wch: Math.max(...[header[1], ...data.map((d) => d[1])].map((s) => calculateWidth(s))) },
    { wch: Math.max(...[header[2], ...data.map((d) => d[2])].map((s) => calculateWidth(s))) },
  ];
  worksheet["!cols"] = columnWidths;

  const rowHeights: number[] = [];
  for (let row = range.s.r; row <= range.e.r; row++) {
    let maxHeight = 30;
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      const cellValue = worksheet[cellAddress]?.v || "";
      const cellWidth = columnWidths[col].wch || 10;
      const lines = Math.ceil(calculateWidth(cellValue) / cellWidth);
      const height = lines * 28 + 4;
      if (height > maxHeight) {
        maxHeight = height;
      }
    }
    rowHeights.push(maxHeight);
  }
  worksheet["!rows"] = rowHeights.map((h) => ({ hpx: h }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "单词识别结果");

  XLSX.writeFile(workbook, `单词识别结果_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/** 导出完整生词本（含复习进度） */
export function exportWordbookToXlsx(items: WordbookItem[]): void {
  if (items.length === 0) return;

  const header = ["单词", "音标", "中译", "学习状态", "复习次数", "答对", "答错", "下次复习", "收录时间"];
  const data = items.map((item) => [
    item.word || "",
    item.phonetic || "",
    item.translation || "",
    item.status === "mastered" ? "已掌握" : "学习中",
    String(item.review_count ?? 0),
    String(item.correct_count ?? 0),
    String(item.wrong_count ?? 0),
    item.due_at || "",
    item.created_at || "",
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet([header, ...data]);
  const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:I1");

  const border = {
    top: { style: "thin" },
    bottom: { style: "thin" },
    left: { style: "thin" },
    right: { style: "thin" },
  } as const;

  for (let row = range.s.r; row <= range.e.r; row++) {
    for (let col = range.s.c; col <= range.e.c; col++) {
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = worksheet[address];
      if (!cell) continue;
      if (row === 0) {
        cell.s = {
          font: { name: "SimSun", sz: 14, bold: true },
          alignment: { horizontal: "center", vertical: "center" },
          fill: { fgColor: { rgb: "E0E0E0" } },
          border,
        };
      } else {
        // 音标列（col 1）显式使用 Times New Roman
        const isPhonetic = col === 1;
        const isChinese = !isPhonetic && (col === 0 || col === 2);
        cell.s = {
          font: { name: isChinese ? "SimSun" : "Times New Roman", sz: 14 },
          alignment: { horizontal: "left", vertical: "center", wrapText: true },
          border,
        };
      }
    }
  }

  const widths = [14, 18, 32, 12, 10, 8, 8, 20, 20];
  worksheet["!cols"] = widths.map((wch) => ({ wch }));
  const rows: number[] = [];
  for (let row = range.s.r; row <= range.e.r; row++) {
    let maxHeight = 24;
    for (let col = range.s.c; col <= range.e.c; col++) {
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      const value = worksheet[address]?.v ?? "";
      const lines = Math.ceil(calculateWidth(value) / (widths[col] || 10));
      maxHeight = Math.max(maxHeight, lines * 20 + 4);
    }
    rows.push(maxHeight);
  }
  worksheet["!rows"] = rows.map((h) => ({ hpx: h }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "我的生词本");
  XLSX.writeFile(workbook, `生词本_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/** 把单词挖空：保留每个字母序列的首字母，其余替换为下划线 */
export function maskWord(word: string): string {
  return String(word || "").replace(/[A-Za-z]+/g, (part) => {
    if (part.length <= 1) return part;
    return part[0] + "_".repeat(part.length - 1);
  });
}

/** 导出挖空练习：一个 sheet 给学生练习，一个 sheet 放答案 */
export function exportClozeToXlsx(items: WordbookItem[]): void {
  if (items.length === 0) return;

  const border = {
    top: { style: "thin" },
    bottom: { style: "thin" },
    left: { style: "thin" },
    right: { style: "thin" },
  } as const;

  const buildSheet = (
    header: string[],
    data: (string | number)[][],
    widths: number[],
    chineseCols: number[]
  ) => {
    const worksheet = XLSX.utils.aoa_to_sheet([header, ...data]);
    const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");
    const lastCol = header.length - 1;

    for (let row = range.s.r; row <= range.e.r; row++) {
      for (let col = 0; col <= lastCol; col++) {
        const address = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = worksheet[address];
        if (!cell) continue;
        if (row === 0) {
          cell.s = {
            font: { name: "SimSun", sz: 14, bold: true },
            alignment: { horizontal: "center", vertical: "center" },
            fill: { fgColor: { rgb: "E0E0E0" } },
            border,
          };
        } else {
          cell.s = {
            font: {
              name: chineseCols.includes(col) ? "SimSun" : "Times New Roman",
              sz: 14,
            },
            alignment: { horizontal: "left", vertical: "center", wrapText: true },
            border,
          };
        }
      }
    }

    worksheet["!cols"] = widths.map((wch) => ({ wch }));
    const heights: number[] = [];
    for (let row = range.s.r; row <= range.e.r; row++) {
      let maxHeight = 24;
      for (let col = 0; col <= lastCol; col++) {
        const address = XLSX.utils.encode_cell({ r: row, c: col });
        const value = worksheet[address]?.v ?? "";
        const lines = Math.ceil(calculateWidth(value) / (widths[col] || 10));
        maxHeight = Math.max(maxHeight, lines * 20 + 4);
      }
      heights.push(maxHeight);
    }
    worksheet["!rows"] = heights.map((h) => ({ hpx: h }));
    return worksheet;
  };

  const practiceHeader = ["序号", "音标", "中译", "挖空单词"];
  const practiceData = items.map((item, index) => [
    index + 1,
    item.phonetic || "",
    item.translation || "",
    maskWord(item.word),
  ]);

  const answerHeader = ["序号", "单词", "音标", "中译"];
  const answerData = items.map((item, index) => [
    index + 1,
    item.word || "",
    item.phonetic || "",
    item.translation || "",
  ]);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    buildSheet(practiceHeader, practiceData, [8, 18, 32, 22], [2]),
    "挖空练习"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    buildSheet(answerHeader, answerData, [8, 18, 18, 32], [3]),
    "答案"
  );
  XLSX.writeFile(workbook, `挖空练习_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function calculateWidth(value: string | number): number {
  const str = String(value);
  let width = 0;
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    if (charCode >= 0x4e00 && charCode <= 0x9fa5) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return Math.max(width, 8);
}