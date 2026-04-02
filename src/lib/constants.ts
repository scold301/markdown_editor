/**
 * 支持的图片扩展名
 */
export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'] as const

/**
 * 会话存储的 key
 */
export const SESSION_KEY = 'mdnb.session.v1'

/**
 * 撤销/重做历史记录限制
 */
export const HISTORY_LIMIT = 200

/**
 * 默认自动保存时间（分钟）
 */
export const DEFAULT_AUTOSAVE_MINUTES = 5

/**
 * 自动保存时间选项
 */
export const AUTOSAVE_OPTIONS = [
  { label: '关闭', minutes: 0 },
  { label: '1 分钟', minutes: 1 },
  { label: '3 分钟', minutes: 3 },
  { label: '5 分钟（默认）', minutes: 5 },
  { label: '10 分钟', minutes: 10 },
] as const
