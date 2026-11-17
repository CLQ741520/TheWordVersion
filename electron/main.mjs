// AsyWL（AsyWordLearning）· 忆廿 — Electron 主进程
// 启动内置的 Express 服务（前端静态文件 + API），再用窗口加载本地地址。
import { app, BrowserWindow, Menu, dialog, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.setName('AsyWL');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow = null;
let serverPort = 0;
let quitting = false;

/** 让系统分配一个空闲端口，避免与本地其他服务冲突 */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** 解析 .env 文本并注入 process.env（不覆盖已有的值） */
function loadEnvFile(file) {
  const content = fs.readFileSync(file, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([\w.-]+)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}

/**
 * 环境变量查找顺序：
 * 1. 用户数据目录下的 .env（推荐：首次运行后可自行填写百度 OCR 密钥）
 * 2. 安装包资源目录 resources/env/.env（构建时本地存在则一并带上）
 * 3. 开发环境项目根目录的 .env
 */
function findEnvFile() {
  const candidates = [path.join(app.getPath('userData'), '.env')];
  if (app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, 'env', '.env'));
  } else {
    candidates.push(path.join(__dirname, '..', '.env'));
  }
  return candidates.find((file) => fs.existsSync(file)) ?? null;
}

function waitForHealth(port, attempts = 80) {
  return new Promise((resolve, reject) => {
    let remaining = attempts;
    const tick = () => {
      const req = http.get(
        { host: '127.0.0.1', port, path: '/api/health', timeout: 1000 },
        (res) => {
          res.resume();
          if (res.statusCode === 200) resolve();
          else retry();
        }
      );
      req.on('timeout', () => req.destroy());
      req.on('error', retry);
    };
    const retry = () => {
      remaining -= 1;
      if (remaining <= 0) {
        reject(new Error('内置服务启动超时'));
      } else {
        setTimeout(tick, 250);
      }
    };
    tick();
  });
}

async function startServer() {
  const userData = app.getPath('userData');
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const envFile = findEnvFile();
  if (envFile) loadEnvFile(envFile);

  const port = await findFreePort();
  serverPort = port;
  process.env.PORT = String(port);
  process.env.HOST = '127.0.0.1';
  process.env.NODE_ENV = 'production';
  process.env.SQLITE_DB_PATH = path.join(dataDir, 'word_app.db');

  // electron-dist/server.mjs 由 scripts/build-electron-server.mjs 生成
  const serverFile = path.join(__dirname, '..', 'electron-dist', 'server.mjs');
  if (!fs.existsSync(serverFile)) {
    throw new Error('缺少 electron-dist/server.mjs，请先运行 npm run electron:build-server');
  }
  await import(pathToFileURL(serverFile).href);
  await waitForHealth(port);
}

function createWindow() {
  // 开发模式使用源码目录图标；打包后窗口图标由可执行文件本身提供
  const devIcon = path.join(__dirname, '..', 'build', 'icon.png');
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'AsyWL · 忆廿',
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#ffffff',
    ...(fs.existsSync(devIcon) ? { icon: devIcon } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 外部链接交给系统浏览器，不在应用内开新窗口
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1')) return { action: 'allow' };
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  try {
    await startServer();
    createWindow();
  } catch (error) {
    dialog.showErrorBox(
      'AsyWL 启动失败',
      `${error instanceof Error ? error.message : String(error)}\n\n请将错误信息反馈给开发者。`
    );
    app.quit();
    return;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  quitting = true;
});
