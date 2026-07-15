import type { WordInfo } from "@/services/wordInfoService";
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
        if (col === 2 && /[\u4e00-\u9fa5]/.test(cellValue.toString())) {
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