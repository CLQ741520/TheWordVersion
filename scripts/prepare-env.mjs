// 准备安装包内的环境变量文件。
// 若项目根目录存在 .env，则复制到 build/env/.env，随安装包放入 resources/env。
// 不随仓库提交（见 .gitignore），分发安装包前请确认是否需要携带自己的密钥。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const source = path.join(root, '.env');
const targetDir = path.join(root, 'build', 'env');

fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });

if (fs.existsSync(source)) {
  fs.copyFileSync(source, path.join(targetDir, '.env'));
  console.log('已将 .env 打包进安装包资源（build/env/.env）');
} else {
  console.log('未找到 .env，安装包将不包含 OCR 密钥；用户可在应用数据目录自行放置 .env');
}
