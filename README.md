# AsyWL · 忆廿

**AsyWL**（全称 **AsyWordLearning**），中文名 **忆廿**，是 **卢盛兴** 个人开发的单词学习工具。

## 应用简介

AsyWL 是一款面向英语学习者的本地单词学习工具，覆盖「单词识别 → 生词收录 → 间隔复习 → 测验巩固 → 学习统计」的完整学习闭环。

它支持从图片、Excel、Word、PDF、TXT 中批量识别英语单词与词组，自动查询音标与中文释义，一键收录到生词本；再通过三档自评（忘记 / 模糊 / 认识）的间隔复习、选择题与拼写测验、错词专项复习帮助记忆；统计页提供学习热力图、连续学习天数、每日目标与高频错词，让学习进度清晰可见。所有数据保存在本地，无需注册账号。

## 主要功能

- **多形式识别**：图片（联网 OCR）、Excel（xlsx/xls/csv）、Word（docx）、PDF、TXT
- **生词本管理**：搜索、状态筛选、编辑、批量删除、导出 Excel、导出挖空题
- **间隔复习**：三档自评 + 简化 SM-2 调度，展示下次复习时间
- **测验**：英译中 / 中译英选择题、拼写题、错题回顾
- **学习统计**：年度 / 月度热力图、连续学习天数、每日目标、高频错词 Top 10
- **识别历史**：回看每次识别的单词，支持删除记录
- **桌面应用**：Windows（安装版 / 免安装版）与 macOS（dmg / zip）

## 桌面版

应用使用 Electron 封装，启动时会在本机回环地址上运行内置服务并加载界面，数据保存在系统用户数据目录中，不依赖外部服务器。

### Windows

```bash
npm install
npm run dist:win
```

产物输出到 `release/`：

- `AsyWL-Setup-<version>.exe`：安装版，可选择安装目录、创建桌面快捷方式
- `AsyWL-Portable-<version>.exe`：免安装版，双击直接运行

### macOS

macOS 安装包（dmg / zip）需要在 macOS 系统上构建，无法在 Windows 上交叉编译：

```bash
npm install
npm run dist:mac
```

也可以通过仓库内的 GitHub Actions 工作流 `.github/workflows/desktop-build.yml` 在 macOS 运行器上自动构建，产物在 Actions 页面下载。

### 首次运行与 OCR 配置

桌面版首次运行会在用户数据目录自动创建数据库。OCR 功能需要百度智能云 OCR 的 API Key：

- Windows：`%APPDATA%\AsyWL\.env`
- macOS：`~/Library/Application Support/AsyWL/.env`

文件内容：

```env
VITE_OCR_API_KEY=你的_API_Key
VITE_OCR_SECRET_KEY=你的_Secret_Key
```

如果构建时项目根目录存在 `.env`，安装包会携带一份作为默认配置；**公开分发安装包前请先删除该文件，避免泄露个人密钥**。

## 本地开发

```bash
npm install
npm run start:dev   # 同时启动前端（Vite, /api 代理到 3001）与后端（Express）
```

其他命令：

```bash
npm run server      # 仅启动后端
npm run build       # 构建前端
npm run desktop     # 构建并启动 Electron 桌面版（开发调试）
```

## 技术栈

React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui；Express + sql.js（SQLite）；Electron + electron-builder。

## 作者

卢盛兴
