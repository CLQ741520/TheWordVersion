
export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * 验证图片文件类型与大小。
 * 接受 jpg/jpeg/png/bmp/webp，压缩时会统一转为 JPEG；单张不超过 10MB。
 */
export function validateImage(file: File): { valid: boolean; message?: string } {
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/bmp", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return { valid: false, message: `不支持的文件类型：${file.name}，请上传 JPG/PNG/BMP/WebP 图片` };
  }
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    return { valid: false, message: `图片大小超过 10MB：${file.name}` };
  }
  return { valid: true };
}

const DOCUMENT_EXTS = [".xlsx", ".xls", ".csv", ".docx", ".pdf", ".txt"];

/** 是否为可直接预览的图片文件 */
export function isImageFile(file: File): boolean {
  return ["image/jpeg", "image/jpg", "image/png", "image/bmp", "image/webp"].includes(file.type);
}

/** 是否为支持文本提取的文档（Excel / Word / PDF / TXT） */
export function isDocumentFile(file: File): boolean {
  const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  return DOCUMENT_EXTS.includes(ext);
}

/**
 * 验证上传文件：图片沿用图片规则（10MB），文档按扩展名识别，单个不超过 30MB。
 */
export function validateUploadFile(file: File): { valid: boolean; message?: string } {
  if (isImageFile(file)) return validateImage(file);
  if (isDocumentFile(file)) {
    if (file.size > 30 * 1024 * 1024) {
      return { valid: false, message: `文件大小超过 30MB：${file.name}` };
    }
    return { valid: true };
  }
  return {
    valid: false,
    message: `不支持的文件类型：${file.name}，请上传图片或 Excel/Word/PDF/TXT 文件`,
  };
}
