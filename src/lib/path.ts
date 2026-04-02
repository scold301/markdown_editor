export function normalizePath(input: string) {
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

export function isProbablyExternalUrl(src: string) {
  const lower = src.toLowerCase()
  return (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('data:') ||
    lower.startsWith('blob:') ||
    lower.startsWith('file:')
  )
}
