# Markdown Notebook

一个功能强大且简洁的 Markdown 笔记本工具，旨在提供类似 Typora 的本地编辑体验。基于 React + TypeScript + Vite 构建，利用现代 Web 技术实现对本地文件系统的直接访问。

## 🚀 核心功能

- **本地文件系统访问 (File System Access API)**：直接打开本地文件夹，所有更改实时同步到本地磁盘。
- **增强型资源管理器**：
  - 树状结构展示目录和文件。
  - 支持所有类型文件的显示（Markdown、图片等）。
  - 支持文件夹的展开与折叠。
  - 实时新建文件、新建文件夹及上传图片。
- **专业级 Markdown 编辑**：
  - 支持 **编辑 (Edit)**、**分屏 (Split)** 和 **预览 (Preview)** 三种视图模式。
  - 集成 `remark-gfm`，完美支持 GitHub 风格的 Markdown。
  - 代码高亮、表格、任务列表等排版优化。
- **多标签页支持**：支持同时打开多个文件并快速切换，路径敏感。
- **自动与手动保存**：停止输入后自动触发保存，或使用 `Ctrl + S` 手动保存。
- **多格式导出**：
  - **PDF 导出**：高质量 PDF 渲染。
  - **Word 导出**：一键导出为 `.doc` 格式。
- **图片支持**：直接在编辑器中打开和预览本地图片文件。

## 🛠️ 技术栈

- **框架**: React 18
- **语言**: TypeScript
- **构建工具**: Vite
- **样式**: Tailwind CSS + Typography 插件
- **图标**: Lucide React
- **功能库**: 
  - `react-markdown` (Markdown 渲染)
  - `jspdf` & `html2canvas` (PDF 导出)
  - `file-saver` (文件下载)

## 📦 快速开始

1. **克隆仓库**:
   ```bash
   git clone https://github.com/scold301/markdown_editor.git
   cd markdown_editor
   ```

2. **安装依赖**:
   ```bash
   npm install
   ```

3. **启动开发服务器**:
   ```bash
   npm run dev
   ```

4. **使用**:
   - 在浏览器中打开提示的地址（通常为 `http://localhost:5173`）。
   - 点击 **"Open Folder"** 选择一个本地文件夹。
   - 授予浏览器对文件夹的访问权限。

## 📄 开源协议

本项目采用 [MIT](LICENSE) 协议。
