// 将 server/server.ts 编译为 Electron 主进程可直接 import 的 ESM 文件。
// 依赖（express / sql.js / pdf-parse 等）保持外部引用，随安装包内的 node_modules 一起分发。
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [path.resolve(__dirname, '../server/server.ts')],
  outfile: path.resolve(__dirname, '../electron-dist/server.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  sourcemap: false,
  logLevel: 'info',
});

console.log('已生成 electron-dist/server.mjs');
