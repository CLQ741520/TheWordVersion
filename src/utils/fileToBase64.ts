import { compressImage } from "./compressImage";

/**
 * 将 File 对象转换为纯 Base64 字符串（不含 data URL 前缀）。
 * 先对图片进行等比压缩，再采用分块读取，避免大图片触发 RangeError 或请求体超限。
 */
export async function fileToBase64(file: File): Promise<string> {
  const compressed = await compressImage(file);
  const buffer = await compressed.arrayBuffer();
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
