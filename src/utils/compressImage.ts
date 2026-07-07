/**
 * 使用 Canvas 对图片进行等比压缩。
 * 最大边长限制为 1920，输出 JPEG 格式，质量 0.8。
 * 返回压缩后的 Blob。
 */
export function compressImage(file: File, maxSide = 1920, quality = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      if (!width || !height) {
        reject(new Error("图片尺寸异常，请更换图片格式后重试"));
        return;
      }

      const scale = Math.min(1, maxSide / Math.max(width, height));
      width = Math.round(width * scale);
      height = Math.round(height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("浏览器不支持 Canvas 压缩，请尝试更换浏览器"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size > 0) {
            resolve(blob);
          } else {
            reject(new Error("图片压缩失败，请尝试上传其他图片"));
          }
        },
        "image/jpeg",
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片加载失败，请确认上传的是 JPG/PNG/BMP/WebP 格式"));
    };

    img.src = url;
  });
}
