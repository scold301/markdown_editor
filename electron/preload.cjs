/**
 * Electron 预加载脚本
 * 通过 contextBridge 安全地暴露 API 给渲染进程
 * 
 * 安全说明：
 * - 使用 contextBridge 确保渲染进程无法直接访问 Node.js API
 * - 所有文件操作都经过主进程验证，防止路径遍历攻击
 */

const { contextBridge, ipcRenderer } = require('electron')

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('desktop', {
  /** 当前操作系统平台 */
  platform: process.platform,
  
  /**
   * 监听菜单动作
   * @param {Function} handler - 处理函数
   * @returns {Function} 取消监听的函数
   */
  onMenuAction: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('menu-action', listener)
    return () => ipcRenderer.removeListener('menu-action', listener)
  },
  
  /** 打开文件夹选择对话框 */
  openFolderDialog: () => ipcRenderer.invoke('dialog:openFolder'),
  
  /** 打开图片文件选择对话框 */
  openImageFilesDialog: () => ipcRenderer.invoke('dialog:openImages'),
  
  /** 打开保存文本文件对话框 */
  saveTextFileDialog: (payload) => ipcRenderer.invoke('dialog:saveMarkdown', payload),
  
  /** 列出目录树 */
  listTree: (rootPath) => ipcRenderer.invoke('fs:listTree', { rootPath }),
  
  /** 读取文本文件 */
  readTextFile: (payload) => ipcRenderer.invoke('fs:readTextFile', payload),
  
  /** 写入文本文件 */
  writeTextFile: (payload) => ipcRenderer.invoke('fs:writeTextFile', payload),
  
  /** 创建目录 */
  mkdir: (payload) => ipcRenderer.invoke('fs:mkdir', payload),
  
  /** 导入文件 */
  importFiles: (payload) => ipcRenderer.invoke('fs:importFiles', payload),
  
  /** 删除文件或目录 */
  deleteEntry: (payload) => ipcRenderer.invoke('fs:deleteEntry', payload),
  
  /** 读取文件为 Data URL */
  readFileAsDataUrl: (payload) => ipcRenderer.invoke('fs:readFileAsDataUrl', payload),
  
  /** 写入 Base64 文件（自动处理重名） */
  writeBase64FileUnique: (payload) => ipcRenderer.invoke('fs:writeBase64FileUnique', payload),
  
  /** 重命名文件或目录 */
  rename: (payload) => ipcRenderer.invoke('fs:rename', payload),
})
