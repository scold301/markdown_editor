/**
 * 对路径进行 URL 编码，用于 Markdown 图片链接
 * @param p 原始路径
 * @returns 编码后的路径
 */
export function encodePathForMarkdown(p: string): string {
  return p.split('/').map(seg => encodeURIComponent(seg)).join('/')
}

/**
 * 计算从源目录到目标文件的相对路径
 * @param fromDir 源目录路径
 * @param toRelPath 目标文件相对路径
 * @returns 相对路径
 */
export function relativePath(fromDir: string, toRelPath: string): string {
  const fromParts = normalizePath(fromDir).split('/').filter(Boolean)
  const toParts = normalizePath(toRelPath).split('/').filter(Boolean)
  
  let common = 0
  while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
    common += 1
  }
  
  const up = fromParts.length - common
  const down = toParts.slice(common)
  const parts = [...Array.from({ length: up }, () => '..'), ...down]
  
  return parts.join('/') || toRelPath
}

/**
 * 规范化路径，统一使用正斜杠，处理 . 和 ..
 * @param input 输入路径
 * @returns 规范化后的路径
 */
export function normalizePath(input: string): string {
  const parts: string[] = []
  for (const raw of input.replace(/\\/g, '/').split('/')) {
    const part = raw.trim()
    if (!part || part === '.') continue
    if (part === '..') {
      parts.pop()
      continue
    }
    parts.push(part)
  }
  return parts.join('/')
}

/**
 * 判断是否为外部 URL
 * @param src 源字符串
 * @returns 是否为外部 URL
 */
export function isProbablyExternalUrl(src: string): boolean {
  const lower = src.toLowerCase()
  return (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('data:') ||
    lower.startsWith('blob:') ||
    lower.startsWith('file:')
  )
}
