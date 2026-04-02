import type { FileItem } from './types'

export {}

declare global {
  interface Window {
    /**
     * Electron 桌面端 API
     * 通过 preload.cjs 暴露给渲染进程的安全接口
     */
    desktop?: {
      /** 当前操作系统平台 */
      platform: string
      
      /**
       * 监听菜单动作
       * @param handler 处理函数
       * @returns 取消监听的函数
       */
      onMenuAction?: (handler: (payload: any) => void) => (() => void) | void
      
      /**
       * 打开文件夹选择对话框
       * @returns 选中的文件夹路径，取消则返回 null
       */
      openFolderDialog?: () => Promise<string | null>
      
      /**
       * 打开图片文件选择对话框
       * @returns 选中的图片文件路径数组，取消则返回 null
       */
      openImageFilesDialog?: () => Promise<string[] | null>
      
      /**
       * 打开保存文本文件对话框
       * @param payload 参数
       * @returns 保存路径信息，取消则返回 null
       */
      saveTextFileDialog?: (payload: { 
        rootPath?: string | null
        defaultName: string 
      }) => Promise<{ rootPath: string; relPath: string } | null>
      
      /**
       * 列出目录树
       * @param rootPath 根目录路径
       * @returns 文件树结构
       */
      listTree?: (rootPath: string) => Promise<FileItem[]>
      
      /**
       * 读取文本文件
       * @param payload 参数
       * @returns 文件内容
       */
      readTextFile?: (payload: { 
        rootPath: string
        relPath: string 
      }) => Promise<string>
      
      /**
       * 写入文本文件
       * @param payload 参数
       * @returns 是否成功
       */
      writeTextFile?: (payload: { 
        rootPath: string
        relPath: string
        content: string 
      }) => Promise<boolean>
      
      /**
       * 创建目录
       * @param payload 参数
       * @returns 是否成功
       */
      mkdir?: (payload: { 
        rootPath: string
        relPath: string 
      }) => Promise<boolean>
      
      /**
       * 导入文件
       * @param payload 参数
       * @returns 保存后的文件名数组
       */
      importFiles?: (payload: { 
        rootPath: string
        dirRelPath: string
        filePaths: string[] 
      }) => Promise<string[]>
      
      /**
       * 删除文件或目录
       * @param payload 参数
       * @returns 是否成功
       */
      deleteEntry?: (payload: { 
        rootPath: string
        relPath: string
        recursive?: boolean 
      }) => Promise<boolean>
      
      /**
       * 读取文件为 Data URL
       * @param payload 参数
       * @returns Data URL 字符串
       */
      readFileAsDataUrl?: (payload: { 
        rootPath: string
        relPath: string 
      }) => Promise<string>
      
      /**
       * 写入 Base64 文件（自动处理重名）
       * @param payload 参数
       * @returns 实际保存的文件名
       */
      writeBase64FileUnique?: (payload: { 
        rootPath: string
        dirRelPath: string
        fileName: string
        base64: string 
      }) => Promise<string>
      
      /**
       * 重命名文件或目录
       * @param payload 参数
       * @returns 是否成功
       */
      rename?: (payload: { 
        rootPath: string
        oldRelPath: string
        newRelPath: string 
      }) => Promise<boolean>
    }
  }
}
