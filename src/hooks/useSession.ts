import { useRef, useCallback, useEffect } from 'react'
import type { OpenTab, SessionState } from '../types'
import { SESSION_KEY } from '../lib/constants'
import { IMAGE_EXTENSIONS } from '../lib/constants'

/**
 * 会话管理 Hook
 * 负责保存和恢复用户会话状态
 */
export function useSession(
  rootPath: string | null,
  openTabs: OpenTab[],
  activeTabId: string | null,
  viewMode: 'edit' | 'preview' | 'split',
  setViewMode: (mode: 'edit' | 'preview' | 'split') => void,
  setRootPath: (path: string | null) => void,
  setFileTree: (tree: any[]) => void,
  setOpenTabs: (tabs: OpenTab[]) => void,
  setActiveTabId: (id: string | null) => void
) {
  const sessionReadyRef = useRef(false)

  /**
   * 恢复会话
   */
  const restoreSession = useCallback(async () => {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (!raw) return
      
      const session = JSON.parse(raw) as SessionState
      if (!session || session.version !== 1) return

      if (session.viewMode === 'edit' || session.viewMode === 'preview' || session.viewMode === 'split') {
        setViewMode(session.viewMode)
      }

      const desktop = (window as any).desktop
      if (!desktop?.listTree) return

      const rootPathForRestore = typeof session.rootPath === 'string' && session.rootPath ? session.rootPath : null
      if (rootPathForRestore) {
        const tree = await desktop.listTree(rootPathForRestore)
        setRootPath(rootPathForRestore)
        setFileTree(tree)
      }

      const loadFromElectron = async (relPath: string): Promise<OpenTab | null> => {
        if (!desktop || !rootPathForRestore) return null
        const lower = relPath.toLowerCase()
        const isImage = IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext))
        
        try {
          if (isImage && desktop.readFileAsDataUrl) {
            const imageUrl = await desktop.readFileAsDataUrl({ rootPath: rootPathForRestore, relPath })
            return {
              id: relPath,
              name: relPath.split('/').pop() || relPath,
              content: '',
              type: 'image',
              imageUrl,
              isDirty: false,
              lastSaved: Date.now(),
              fsPath: relPath,
            }
          }
          if (!isImage && desktop.readTextFile) {
            const content = await desktop.readTextFile({ rootPath: rootPathForRestore, relPath })
            return {
              id: relPath,
              name: relPath.split('/').pop() || relPath,
              content,
              type: 'markdown',
              isDirty: false,
              lastSaved: Date.now(),
              fsPath: relPath,
            }
          }
        } catch {
          return null
        }
        return null
      }

      const sessionTabs = Array.isArray(session.openTabs) ? session.openTabs : []
      const restored: OpenTab[] = []
      
      for (const t of sessionTabs) {
        if (t && t.kind === 'draft' && typeof t.id === 'string') {
          restored.push({
            id: t.id,
            name: typeof t.name === 'string' ? t.name : '新文件.md',
            content: typeof t.content === 'string' ? t.content : '',
            type: 'markdown',
            isDirty: true,
            isNew: true,
          })
          continue
        }

        const relPath = typeof t?.path === 'string' ? t.path : typeof t?.fsPath === 'string' ? t.fsPath : typeof t?.id === 'string' ? t.id : ''
        if (!relPath) continue

        if (rootPathForRestore) {
          const tab = await loadFromElectron(relPath)
          if (tab) restored.push(tab)
        }
      }

      if (restored.length > 0) {
        setOpenTabs(restored)
        const desired = typeof session.activeTabId === 'string' ? session.activeTabId : null
        setActiveTabId(desired && restored.some(t => t.id === desired) ? desired : restored[0].id)
      }
    } catch {
    } finally {
      sessionReadyRef.current = true
    }
  }, [setViewMode, setRootPath, setFileTree, setOpenTabs, setActiveTabId])

  /**
   * 持久化会话
   */
  const persistSession = useCallback(async () => {
    if (!sessionReadyRef.current) return
    
    const rootPathToStore = typeof rootPath === 'string' && rootPath ? rootPath : null
    const openTabsToStore = openTabs.map((t) => {
      if (t.id.startsWith('untitled-') || t.isNew || !t.fsPath) {
        return { kind: 'draft' as const, id: t.id, name: t.name, content: t.content }
      }
      return { kind: 'file' as const, id: t.id, path: t.fsPath || t.id, type: t.type, name: t.name }
    })
    
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        version: 1,
        rootPath: rootPathToStore,
        openTabs: openTabsToStore,
        activeTabId,
        viewMode,
      })
    )
  }, [rootPath, openTabs, activeTabId, viewMode])

  useEffect(() => {
    restoreSession()
  }, [restoreSession])

  useEffect(() => {
    persistSession()
  }, [persistSession])

  return {
    sessionReadyRef,
  }
}
