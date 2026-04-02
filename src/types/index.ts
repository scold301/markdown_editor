/**
 * 文件树节点类型定义
 */
export interface FileItem {
  name: string
  kind: 'file' | 'directory'
  path: string
  children?: FileItem[]
}

/**
 * 打开的标签页类型
 */
export interface OpenTab {
  id: string
  name: string
  content: string
  type: 'markdown' | 'image'
  imageUrl?: string
  isDirty: boolean
  lastSaved?: number
  fsPath?: string
  isNew?: boolean
}

/**
 * 撤销/重做历史记录
 */
export interface History {
  past: string[]
  future: string[]
}

/**
 * 会话状态（用于持久化）
 */
export interface SessionState {
  version: number
  rootPath: string | null
  openTabs: Array<{
    kind: 'draft' | 'file'
    id: string
    name?: string
    content?: string
    path?: string
    fsPath?: string
    type?: 'markdown' | 'image'
  }>
  activeTabId: string | null
  viewMode: 'edit' | 'preview' | 'split'
}

/**
 * 保存状态
 */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/**
 * 视图模式
 */
export type ViewMode = 'edit' | 'preview' | 'split'
