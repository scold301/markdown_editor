# Markdown Notebook

一个类似 Typora 的本地 Markdown 笔记本工具，提供资源管理器、多标签页编辑、预览与导出等能力。当前为 Electron 桌面应用（不再提供浏览器版）。

当前版本：v1.0

## 🧱 技术架构

- **桌面端**：Electron（主进程 + preload + 渲染进程）
- **渲染进程 UI**：React 18 + TypeScript + Tailwind CSS
- **Markdown 渲染**：`react-markdown` + `remark-gfm`
- **图表渲染**：`mermaid`（```mermaid 代码块预览）
- **导出**：`html2canvas` + `jspdf`（PDF），`file-saver`（导出 Word）
- **文件系统**：通过 `preload` 暴露 `window.desktop`，由主进程 IPC 执行读写/目录树/重命名/删除等操作

## 🚀 核心功能

- **增强型资源管理器**：
  - 树状结构展示目录和文件。
  - 支持 Markdown、图片等文件展示与打开。
  - 支持文件夹的展开与折叠。
-  - 支持新建文件/新建文件夹、删除、导入图片。
- **多标签页编辑**：
  - 支持同时打开多个文件并快速切换。
  - 双击标签页重命名（会同步重命名磁盘文件）。
  - 启动自动恢复上次未关闭的文件夹与标签页。
- **编辑体验**：
  - 支持 **编辑 / 分屏 / 预览** 三种视图。
  - 支持撤销/重做：`Ctrl+Z`、`Ctrl+Y`（也支持 `Ctrl+Shift+Z`）。
  - 支持拖拽图片到编辑器：从系统拖入会自动保存并插入引用；从资源管理器拖入会直接插入引用。
- **Markdown / 图表预览**：
  - 支持 GitHub 风格 Markdown（GFM）。
  - 支持 Mermaid：使用 ```mermaid 代码块即可在预览中渲染图表。
- **保存与自动保存**：
  - `Ctrl+S` 手动保存。
  - 文件菜单可设置自动保存时间（默认 5 分钟）。
- **多格式导出**：
  - **PDF 导出**：高质量渲染并支持多页导出。
  - **Word 导出**：一键导出为 `.doc` 格式。
- **图片支持**：图片文件可直接打开预览；Markdown 内图片引用可预览显示。

## 🛠️ 技术栈

- **框架**: React 18
- **语言**: TypeScript
- **构建工具**: Vite
- **桌面端**: Electron
- **样式**: Tailwind CSS + Typography
- **图标**: Lucide React
- **功能库**: 
  - `react-markdown` (Markdown 渲染)
  - `jspdf` & `html2canvas` (PDF 导出)
  - `file-saver` (文件下载)
  - `mermaid` (图表渲染)

## 📦 安装与启动

1. **安装依赖**
   ```bash
   npm install
   ```

2. **开发启动（本地构建 + 启动 Electron）**
   ```bash
   npm run dev
   ```

3. **直接启动（需要已存在 dist，例如先执行过 build:web）**
   ```bash
   npm start
   ```

## 🏗️ 编译与打包

- **仅构建前端产物（输出到 dist）**
  ```bash
  npm run build:web
  ```

- **打包桌面安装包（输出到 release）**
  ```bash
  npm run build:app
  ```

## 🖼️ 图标

- 默认使用 [build/icon.png](build/icon.png) 作为应用图标来源（Windows/macOS/Linux）。

## 📄 开源协议

本项目采用 [MIT](LICENSE) 协议。
