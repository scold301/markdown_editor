import { useState, useEffect } from 'react'
import { isProbablyExternalUrl, normalizePath } from '../utils'

interface ResolvedMarkdownImageProps {
  src?: string
  alt?: string
  title?: string
  rootPath?: string | null
  activeTabId?: string | null
  activeTab?: any
  imageSrcCache: Record<string, string>
  setImageSrcCache: React.Dispatch<React.SetStateAction<Record<string, string>>>
}

/**
 * Markdown 图片解析组件
 * 用于解析 Markdown 中的图片路径，支持相对路径和外部 URL
 */
export function ResolvedMarkdownImage({
  src = '',
  alt,
  title,
  rootPath,
  activeTabId,
  activeTab,
  imageSrcCache,
  setImageSrcCache,
}: ResolvedMarkdownImageProps) {
  const [resolvedSrc, setResolvedSrc] = useState<string>(src)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (!src) return
      if (isProbablyExternalUrl(src)) {
        setResolvedSrc(src)
        return
      }
      if (!activeTab || activeTab.type !== 'markdown') {
        setResolvedSrc(src)
        return
      }

      const safeDecode = (value: string) => {
        try {
          return decodeURIComponent(value)
        } catch {
          return value
        }
      }

      const lookupRaw = src.split(/[?#]/)[0]
      const lookup = safeDecode(lookupRaw)
      const baseDir = activeTab.id.split('/').slice(0, -1).join('/')

      const candidates: string[] = []
      const addCandidate = (p: string) => {
        const normalized = normalizePath(p)
        if (!normalized) return
        if (!candidates.includes(normalized)) candidates.push(normalized)
      }

      if (lookup.startsWith('/')) addCandidate(lookup.slice(1))
      else addCandidate(baseDir ? `${baseDir}/${lookup}` : lookup)

      if (lookupRaw !== lookup) {
        if (lookupRaw.startsWith('/')) addCandidate(lookupRaw.slice(1))
        else addCandidate(baseDir ? `${baseDir}/${lookupRaw}` : lookupRaw)
      }

      for (const candidatePath of candidates) {
        const cached = imageSrcCache[candidatePath]
        if (cached) {
          setResolvedSrc(cached)
          return
        }

        try {
          const desktop = (window as any).desktop
          if (rootPath && desktop?.readFileAsDataUrl) {
            const dataUrl = await desktop.readFileAsDataUrl({ rootPath, relPath: candidatePath })
            if (cancelled) return
            setImageSrcCache(prev => ({ ...prev, [candidatePath]: dataUrl }))
            setResolvedSrc(dataUrl)
            return
          }
        } catch {
        }
      }

      setResolvedSrc(src)
    }

    run()
    return () => {
      cancelled = true
    }
  }, [src, rootPath, activeTabId, activeTab, imageSrcCache, setImageSrcCache])

  return <img src={resolvedSrc} alt={alt} title={title} />
}
