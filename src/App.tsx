import { useState, useEffect, useRef, isValidElement } from 'react'
import { 
  FileText, Trash2, Eye, Edit3, 
  FolderOpen, ChevronRight, ChevronDown, X, 
  Clock, CheckCircle, AlertCircle, File, FolderPlus, FilePlus, Image as ImageIcon,
  Upload
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { saveAs } from 'file-saver'
import mermaid from 'mermaid'
import { IMAGE_EXTENSIONS } from './lib/constants'
import { isProbablyExternalUrl, normalizePath } from './lib/path'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

interface FileItem {
  name: string
  kind: 'file' | 'directory'
  path: string
  children?: FileItem[]
}

interface OpenTab {
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

function App() {
  const [rootPath, setRootPath] = useState<string | null>(null)
  const [fileTree, setFileTree] = useState<FileItem[]>([])
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const createUntitledTab = (n: number): OpenTab => ({
    id: `untitled-${n}`,
    name: `新文件${n}.md`,
    content: '',
    type: 'markdown',
    isDirty: true,
    isNew: true,
  })

  const [openTabs, setOpenTabs] = useState<OpenTab[]>(() => [createUntitledTab(1)])
  const [activeTabId, setActiveTabId] = useState<string | null>(() => 'untitled-1')
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>('split')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [aboutOpen, setAboutOpen] = useState(false)
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [autoSaveMinutes, setAutoSaveMinutes] = useState<number>(() => {
    const saved = localStorage.getItem('autoSaveMinutes')
    const parsed = saved ? Number(saved) : 5
    return Number.isFinite(parsed) ? parsed : 5
  })
  const [imageSrcCache, setImageSrcCache] = useState<Record<string, string>>({})
  const previewRef = useRef<HTMLDivElement>(null)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorRef = useRef<HTMLTextAreaElement | null>(null)
  const nextUntitledNumberRef = useRef(2)
  const historyRef = useRef<Record<string, { past: string[]; future: string[] }>>({})
  const HISTORY_LIMIT = 200

  const activeTab = openTabs.find(t => t.id === activeTabId)

  useEffect(() => {
    localStorage.setItem('autoSaveMinutes', String(autoSaveMinutes))
  }, [autoSaveMinutes])

  useEffect(() => {
    let max = 0
    for (const tab of openTabs) {
      const m = /^untitled-(\d+)$/.exec(tab.id)
      if (!m) continue
      const n = Number(m[1])
      if (Number.isFinite(n) && n > max) max = n
    }
    const next = max + 1
    if (next > nextUntitledNumberRef.current) nextUntitledNumberRef.current = next
  }, [openTabs])

  const SESSION_KEY = 'mdnb.session.v1'
  const sessionReadyRef = useRef(false)

  useEffect(() => {
    const restore = async () => {
      try {
        const raw = localStorage.getItem(SESSION_KEY)
        if (!raw) return
        const session = JSON.parse(raw) as any
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
          setExpandedFolders(new Set())
        }

        const loadFromElectron = async (relPath: string) => {
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
                type: 'image' as const,
                imageUrl,
                isDirty: false,
                lastSaved: Date.now(),
                fsPath: relPath,
              } satisfies OpenTab
            }
            if (!isImage && desktop.readTextFile) {
              const content = await desktop.readTextFile({ rootPath: rootPathForRestore, relPath })
              return {
                id: relPath,
                name: relPath.split('/').pop() || relPath,
                content,
                type: 'markdown' as const,
                isDirty: false,
                lastSaved: Date.now(),
                fsPath: relPath,
              } satisfies OpenTab
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
            continue
          }
        }

        if (restored.length > 0) {
          setOpenTabs(restored)
          const desired = typeof session.activeTabId === 'string' ? session.activeTabId : null
          setActiveTabId(desired && restored.some(t => t.id === desired) ? desired : restored[0].id)
          return
        }
      } catch {
      } finally {
        sessionReadyRef.current = true
      }
    }

    restore()
  }, [])

  useEffect(() => {
    const persist = async () => {
      if (!sessionReadyRef.current) return
      const rootPathToStore = typeof rootPath === 'string' && rootPath ? rootPath : null
      const openTabsToStore = openTabs.map((t) => {
        if (t.id.startsWith('untitled-') || t.isNew || !t.fsPath) {
          return { kind: 'draft', id: t.id, name: t.name, content: t.content }
        }
        return { kind: 'file', id: t.id, path: t.fsPath || t.id, type: t.type, name: t.name }
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
    }
    persist()
  }, [rootPath, openTabs, activeTabId, viewMode])

  const refreshFileTree = async () => {
    const desktop = (window as any).desktop
    if (!rootPath || !desktop?.listTree) return
    const tree = await desktop.listTree(rootPath)
    setFileTree(tree)
  }

  const openFolder = async () => {
    try {
      setImageSrcCache({})

      const desktop = (window as any).desktop
      if (!desktop?.openFolderDialog || !desktop?.listTree) return
      const folderPath = await desktop.openFolderDialog()
      if (!folderPath) return
      setRootPath(folderPath)
      const tree = await desktop.listTree(folderPath)
      setFileTree(tree)
      setExpandedFolders(new Set())
    } catch (err) {
      console.error('Failed to open directory:', err)
    }
  }

  const toggleFolder = (path: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    setExpandedFolders(newExpanded)
  }

  const openFileFromFs = async (relPath: string) => {
    const existingTab = openTabs.find(t => t.id === relPath)
    if (existingTab) {
      setActiveTabId(existingTab.id)
      return
    }
    const desktop = (window as any).desktop
    if (!desktop || !rootPath) return

    const lower = relPath.toLowerCase()
    const isImage = IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext))
    let content = ''
    let imageUrl = ''

    try {
      if (isImage) {
        imageUrl = await desktop.readFileAsDataUrl({ rootPath, relPath })
      } else {
        content = await desktop.readTextFile({ rootPath, relPath })
      }
    } catch (err) {
      console.error(err)
      alert('打开文件失败')
      return
    }

    const name = relPath.split('/').pop() || relPath
    const newTab: OpenTab = {
      id: relPath,
      name,
      content,
      type: isImage ? 'image' : 'markdown',
      imageUrl,
      isDirty: false,
      lastSaved: Date.now(),
      fsPath: relPath,
    }
    setOpenTabs([...openTabs, newTab])
    setActiveTabId(newTab.id)
  }

  const createNewFile = async (parentPath = '') => {
    try {
      const fileName = prompt('Enter file name (e.g., new_note.md):', 'new_note.md')
      if (!fileName) return
      const normalizedName = fileName.includes('.') ? fileName : `${fileName}.md`

      const desktop = (window as any).desktop
      if (!rootPath || !desktop?.writeTextFile) return
      const relPath = parentPath ? `${parentPath}/${normalizedName}` : normalizedName
      await desktop.writeTextFile({ rootPath, relPath, content: '' })
      await refreshFileTree()
      if (parentPath) setExpandedFolders(prev => new Set(prev).add(parentPath))
      await openFileFromFs(relPath)
    } catch (err) {
      console.error('Failed to create file:', err)
      alert('新建文件失败：请确认已授予文件夹写入权限。')
    }
  }

  const createNewFolder = async (parentPath = '') => {
    try {
      const folderName = prompt('Enter folder name:')
      if (!folderName) return

      const desktop = (window as any).desktop
      if (!rootPath || !desktop?.mkdir) return
      const relPath = parentPath ? `${parentPath}/${folderName}` : folderName
      await desktop.mkdir({ rootPath, relPath })
      await refreshFileTree()
      if (parentPath) setExpandedFolders(prev => new Set(prev).add(parentPath))
    } catch (err) {
      console.error('Failed to create folder:', err)
      alert('新建文件夹失败：请确认已授予文件夹写入权限。')
    }
  }

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const tabToClose = openTabs.find(t => t.id === id)
    if (tabToClose?.imageUrl) {
      URL.revokeObjectURL(tabToClose.imageUrl)
    }
    delete historyRef.current[id]
    
    const newTabs = openTabs.filter(t => t.id !== id)
    setOpenTabs(newTabs)
    if (activeTabId === id) {
      setActiveTabId(newTabs[newTabs.length - 1]?.id || null)
    }
  }

  const startRenameTab = (tab: OpenTab) => {
    setRenamingTabId(tab.id)
    setRenameValue(tab.name)
  }

  const commitRenameTab = async () => {
    const tab = openTabs.find(t => t.id === renamingTabId)
    if (!tab) {
      setRenamingTabId(null)
      setRenameValue('')
      return
    }

    const nextNameRaw = renameValue.trim()
    if (!nextNameRaw) {
      setRenamingTabId(null)
      setRenameValue('')
      return
    }

    const nextName = nextNameRaw.includes('.') ? nextNameRaw : `${nextNameRaw}.md`

    if (tab.isNew || !tab.fsPath) {
      setOpenTabs(tabs => tabs.map(t => t.id === tab.id ? { ...t, name: nextName } : t))
      setRenamingTabId(null)
      setRenameValue('')
      return
    }

    const oldPath = tab.fsPath
    const dirRel = oldPath.includes('/') ? oldPath.split('/').slice(0, -1).join('/') : ''
    const nextRelPath = dirRel ? `${dirRel}/${nextName}` : nextName

    if (openTabs.some(t => t.id === nextRelPath && t.id !== tab.id)) {
      alert('已存在同名文件标签页，请先关闭或改名。')
      return
    }

    try {
      const desktop = (window as any).desktop
      if (!rootPath || !desktop?.rename) return
      await desktop.rename({ rootPath, oldRelPath: oldPath, newRelPath: nextRelPath })
      await refreshFileTree()
      setOpenTabs(tabs => tabs.map(t => (
        t.id === tab.id
          ? { ...t, id: nextRelPath, fsPath: nextRelPath, name: nextName }
          : t
      )))
      if (activeTabId === tab.id) setActiveTabId(nextRelPath)
      setRenamingTabId(null)
      setRenameValue('')
    } catch (err) {
      console.error(err)
      alert('重命名失败：请确认文件未被占用且有写入权限。')
    }
  }

  const cancelRenameTab = () => {
    setRenamingTabId(null)
    setRenameValue('')
  }

  const addNewTab = () => {
    const n = nextUntitledNumberRef.current
    nextUntitledNumberRef.current += 1
    const tab = createUntitledTab(n)
    setOpenTabs(tabs => [...tabs, tab])
    setActiveTabId(tab.id)
  }

  const updateActiveContent = (content: string, options?: { recordHistory?: boolean }) => {
    if (!activeTabId || activeTab?.type !== 'markdown') return
    const recordHistory = options?.recordHistory !== false
    setOpenTabs(tabs => tabs.map(t => 
      {
        if (t.id !== activeTabId) return t
        if (recordHistory) {
          const history = (historyRef.current[activeTabId] ||= { past: [], future: [] })
          const prev = t.content
          if (history.past.length === 0 || history.past[history.past.length - 1] !== prev) {
            history.past.push(prev)
            if (history.past.length > HISTORY_LIMIT) history.past.shift()
          }
          history.future = []
        }
        return { ...t, content, isDirty: true }
      }
    ))
    
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    if (autoSaveMinutes > 0 && activeTab.fsPath) {
      autoSaveTimerRef.current = setTimeout(() => {
        saveActiveFile()
      }, autoSaveMinutes * 60 * 1000)
    }
  }

  const focusEditorToEnd = () => {
    requestAnimationFrame(() => {
      const textarea = editorRef.current
      if (!textarea) return
      const pos = textarea.value.length
      textarea.focus()
      textarea.setSelectionRange(pos, pos)
    })
  }

  const undoActive = () => {
    if (!activeTabId) return
    const history = (historyRef.current[activeTabId] ||= { past: [], future: [] })
    setOpenTabs(tabs => tabs.map(t => {
      if (t.id !== activeTabId) return t
      if (t.type !== 'markdown') return t
      const prev = history.past.pop()
      if (prev === undefined) return t
      history.future.push(t.content)
      if (history.future.length > HISTORY_LIMIT) history.future.shift()
      return { ...t, content: prev, isDirty: true }
    }))
    focusEditorToEnd()
  }

  const redoActive = () => {
    if (!activeTabId) return
    const history = (historyRef.current[activeTabId] ||= { past: [], future: [] })
    setOpenTabs(tabs => tabs.map(t => {
      if (t.id !== activeTabId) return t
      if (t.type !== 'markdown') return t
      const next = history.future.pop()
      if (next === undefined) return t
      history.past.push(t.content)
      if (history.past.length > HISTORY_LIMIT) history.past.shift()
      return { ...t, content: next, isDirty: true }
    }))
    focusEditorToEnd()
  }

  const insertTextAtCursor = (text: string) => {
    const textarea = editorRef.current
    if (!textarea || !activeTab || activeTab.type !== 'markdown') return
    const start = textarea.selectionStart ?? activeTab.content.length
    const end = textarea.selectionEnd ?? activeTab.content.length
    const next = `${activeTab.content.slice(0, start)}${text}${activeTab.content.slice(end)}`
    updateActiveContent(next)
    queueMicrotask(() => {
      if (!editorRef.current) return
      const pos = start + text.length
      editorRef.current.focus()
      editorRef.current.setSelectionRange(pos, pos)
    })
  }

  const encodePathForMarkdown = (p: string) => {
    return p.split('/').map(seg => encodeURIComponent(seg)).join('/')
  }

  const relativePath = (fromDir: string, toRelPath: string) => {
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

  const onDropToEditor = async (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault()
    if (!activeTab || activeTab.type !== 'markdown') return

    const internalImageRelPath = e.dataTransfer.getData('application/x-mdnb-image-relpath')
    if (internalImageRelPath) {
      const baseDir =
        !activeTab.id.startsWith('untitled-') && activeTab.id.includes('/')
          ? activeTab.id.split('/').slice(0, -1).join('/')
          : ''
      const refPath = baseDir ? relativePath(baseDir, internalImageRelPath) : internalImageRelPath
      insertTextAtCursor(`\n![](${encodePathForMarkdown(refPath)})\n`)
      return
    }

    const files = Array.from(e.dataTransfer.files || [])
    const images = files.filter(f => f.type.startsWith('image/'))
    if (images.length === 0) return

    try {
      const fileToBase64 = async (file: File) => {
        const buf = new Uint8Array(await file.arrayBuffer())
        let binary = ''
        for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i])
        return btoa(binary)
      }

      const desktop = (window as any).desktop
      const relBaseDir = activeTab.id.includes('/') ? activeTab.id.split('/').slice(0, -1).join('/') : ''

      if (rootPath && desktop?.writeBase64FileUnique) {
        const refs: string[] = []
        for (const file of images) {
          const base64 = await fileToBase64(file)
          const savedName = await desktop.writeBase64FileUnique({
            rootPath,
            dirRelPath: relBaseDir,
            fileName: file.name,
            base64,
          })
          refs.push(`![](${encodeURIComponent(savedName)})`)
        }
        await refreshFileTree()
        if (relBaseDir) setExpandedFolders(prev => new Set(prev).add(relBaseDir))
        insertTextAtCursor((refs.length ? '\n' : '') + refs.join('\n') + '\n')
        return
      }

      alert('请先打开一个文件夹后再拖拽图片。')
    } catch (err) {
      console.error(err)
      alert('拖拽图片保存失败：请确认已授予文件夹写入权限。')
    }
  }

  const saveActiveFile = async () => {
    if (!activeTab || activeTab.type !== 'markdown') return
    
    setSaveStatus('saving')
    try {
      const desktop = (window as any).desktop

      if (activeTab.fsPath && rootPath && desktop?.writeTextFile) {
        await desktop.writeTextFile({ rootPath, relPath: activeTab.fsPath, content: activeTab.content })
      } else if (desktop?.saveTextFileDialog && desktop?.writeTextFile && desktop?.listTree) {
        const result = await desktop.saveTextFileDialog({
          rootPath,
          defaultName: activeTab.name.endsWith('.md') ? activeTab.name : `${activeTab.name}.md`,
        })
        if (!result) {
          setSaveStatus('idle')
          return
        }
        const { rootPath: savedRootPath, relPath } = result
        await desktop.writeTextFile({ rootPath: savedRootPath, relPath, content: activeTab.content })
        setRootPath(savedRootPath)
        const tree = await desktop.listTree(savedRootPath)
        setFileTree(tree)
        setExpandedFolders(new Set())

        const fileName = relPath.split('/').pop() || relPath
        setOpenTabs(tabs => tabs.map(t => (
          t.id === activeTab.id
            ? { ...t, id: relPath, fsPath: relPath, name: fileName, isDirty: false, isNew: false, lastSaved: Date.now() }
            : t
        )))
        setActiveTabId(relPath)
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
        return
      } else {
        alert('当前环境不支持保存。')
        setSaveStatus('idle')
        return
      }
      
      setOpenTabs(tabs => tabs.map(t => 
        t.id === activeTab.id ? { ...t, isDirty: false, lastSaved: Date.now() } : t
      ))
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (err) {
      console.error('Failed to save file:', err)
      setSaveStatus('error')
    }
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (renamingTabId) return
      const isUndo = (e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')
      const isRedo =
        (e.ctrlKey || e.metaKey) &&
        ((e.key === 'y' || e.key === 'Y') || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))

      if (isUndo) {
        e.preventDefault()
        undoActive()
        return
      }
      if (isRedo) {
        e.preventDefault()
        redoActive()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        saveActiveFile()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTabId, renamingTabId, activeTab?.type, activeTab?.fsPath])

  useEffect(() => {
    const desktop = (window as any).desktop
    const unsubscribe = desktop?.onMenuAction?.((action: any) => {
      if (!action) return
      if (action.type === 'save') saveActiveFile()
      if (action.type === 'export_pdf') exportPDF()
      if (action.type === 'export_word') exportWord()
      if (action.type === 'open_folder') openFolder()
      if (action.type === 'undo') undoActive()
      if (action.type === 'redo') redoActive()
      if (action.type === 'about') setAboutOpen(true)
      if (action.type === 'set_autosave') setAutoSaveMinutes(Number(action.minutes) || 0)
    })
    return () => unsubscribe?.()
  }, [activeTab, autoSaveMinutes, rootPath])

  const deleteItem = async (item: FileItem, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!rootPath) return
    
    const confirmDelete = confirm(`Are you sure you want to delete ${item.name}?`)
    if (!confirmDelete) return

    try {
      const desktop = (window as any).desktop
      if (!desktop?.deleteEntry) return
      await desktop.deleteEntry({ rootPath, relPath: item.path, recursive: item.kind === 'directory' })
      
      if (item.kind === 'file') {
        const tabToClose = openTabs.find(t => t.id === item.path)
        if (tabToClose) {
          closeTab(tabToClose.id, e as any)
        }
      }
      
      await refreshFileTree()
    } catch (err) {
      console.error('Failed to delete item:', err)
      alert('Failed to delete. It might be in use or you might not have permission.')
    }
  }

  const uploadImage = async (parentPath = '') => {
    if (!rootPath) return

    try {
      const desktop = (window as any).desktop
      if (!desktop?.openImageFilesDialog || !desktop?.importFiles) return

      const filePaths = await desktop.openImageFilesDialog()
      if (!filePaths || filePaths.length === 0) return

      const savedNames: string[] = await desktop.importFiles({ rootPath, dirRelPath: parentPath, filePaths })
      await refreshFileTree()
      if (parentPath) setExpandedFolders(prev => new Set(prev).add(parentPath))
      for (const savedName of savedNames) {
        const relPath = parentPath ? `${parentPath}/${savedName}` : savedName
        await openFileFromFs(relPath)
      }
    } catch (err) {
      console.error('Failed to upload image:', err)
      alert('保存图片失败：请确认已授予文件夹写入权限。')
    }
  }

  const renderFileTree = (items: FileItem[], depth = 0) => {
    return items.map(item => {
      const isExpanded = expandedFolders.has(item.path)
      const isImage = IMAGE_EXTENSIONS.some(ext => item.name.toLowerCase().endsWith(ext))
      const isMarkdown = item.name.toLowerCase().endsWith('.md')

      return (
        <div key={item.path} className="select-none">
          <div 
            onClick={(e) => {
              if (item.kind === 'directory') {
                toggleFolder(item.path, e)
                return
              }
              openFileFromFs(item.path)
            }}
            draggable={item.kind === 'file' && isImage}
            onDragStart={(e) => {
              if (item.kind !== 'file' || !isImage) return
              e.stopPropagation()
              e.dataTransfer.effectAllowed = 'copy'
              e.dataTransfer.setData('application/x-mdnb-image-relpath', item.path)
              e.dataTransfer.setData('text/plain', item.path)
            }}
            className={cn(
              "flex items-center gap-1.5 py-1 px-2 hover:bg-gray-200 cursor-pointer rounded text-sm transition-colors group",
              activeTabId === item.path ? "bg-white shadow-sm text-blue-600 font-medium" : "text-gray-600"
            )}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            {item.kind === 'directory' ? (
              <>
                {isExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                <span className="truncate flex-1">{item.name}</span>
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-gray-400">
                  <button onClick={(e) => { e.stopPropagation(); createNewFile(item.path) }} title="New File" className="hover:text-blue-500"><FilePlus size={12} /></button>
                  <button onClick={(e) => { e.stopPropagation(); createNewFolder(item.path) }} title="New Folder" className="hover:text-blue-500"><FolderPlus size={12} /></button>
                  <button onClick={(e) => { e.stopPropagation(); uploadImage(item.path) }} title="Upload Image" className="hover:text-blue-500"><Upload size={12} /></button>
                  <button onClick={(e) => deleteItem(item, e)} title="Delete" className="hover:text-red-500"><Trash2 size={12} /></button>
                </div>
              </>
            ) : (
              <>
                {isImage ? <ImageIcon size={14} className="text-purple-500" /> : 
                 isMarkdown ? <FileText size={14} className="text-blue-500" /> : 
                 <File size={14} className="text-gray-400" />}
                <span className="truncate flex-1">{item.name}</span>
                <button 
                  onClick={(e) => deleteItem(item, e)}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                  title="Delete"
                >
                  <Trash2 size={12} />
                </button>
              </>
            )}
          </div>
          {item.kind === 'directory' && isExpanded && item.children && (
            <div>{renderFileTree(item.children, depth + 1)}</div>
          )}
        </div>
      )
    })
  }

  const exportPDF = async () => {
    if (!activeTab || activeTab.type !== 'markdown') return
    let restoreView = () => {}
    try {
      const ensurePreviewElement = async () => {
        if (previewRef.current) return { element: previewRef.current, restore: () => {} }
        const prevMode = viewMode
        setViewMode('preview')
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        return { element: previewRef.current, restore: () => setViewMode(prevMode) }
      }

      const { element, restore } = await ensurePreviewElement()
      restoreView = restore
      if (!element) {
        alert('预览未就绪，请稍后重试')
        return
      }

      const imgs = Array.from(element.querySelectorAll('img'))
      await Promise.all(
        imgs.map((img) => {
          if (img.complete) return Promise.resolve()
          return new Promise<void>((resolve) => {
            const done = () => resolve()
            img.addEventListener('load', done, { once: true })
            img.addEventListener('error', done, { once: true })
          })
        })
      )

      const canvas = await html2canvas(element, { scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff' })
      const imgData = canvas.toDataURL('image/png')

      const pdf = new jsPDF('p', 'mm', 'a4')
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width

      let heightLeft = pdfHeight
      let position = 0
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight)
      heightLeft -= pageHeight

      while (heightLeft > 0) {
        position = heightLeft - pdfHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight)
        heightLeft -= pageHeight
      }

      const baseName = (activeTab.name || '导出').replace(/\.md$/i, '')
      saveAs(pdf.output('blob'), `${baseName}.pdf`)
    } catch (err) {
      console.error(err)
      alert('导出 PDF 失败')
    } finally {
      restoreView()
    }
  }

  const exportWord = () => {
    if (!activeTab || activeTab.type !== 'markdown') return
    const content = `<html><body>${previewRef.current?.innerHTML || ''}</body></html>`
    const blob = new Blob(['\ufeff', content], { type: 'application/msword' })
    saveAs(blob, `${activeTab.name}.doc`)
  }

  function MermaidDiagram({ chart }: { chart: string }) {
    const idRef = useRef(`m-${Math.random().toString(36).slice(2)}`)
    const containerRef = useRef<HTMLDivElement | null>(null)
    const [svg, setSvg] = useState<string>('')

    useEffect(() => {
      let cancelled = false
      const run = async () => {
        const code = String(chart || '').trim()
        if (!code) {
          setSvg('')
          return
        }

        try {
          ;(mermaid as any).initialize?.({
            startOnLoad: false,
            securityLevel: 'loose',
          })
        } catch {
        }

        try {
          const renderer: any = mermaid as any
          const result = await renderer.render(idRef.current, code)
          const nextSvg = typeof result === 'string' ? result : String(result?.svg || '')
          if (cancelled) return
          setSvg(nextSvg)
          const bind = result?.bindFunctions
          if (typeof bind === 'function') {
            queueMicrotask(() => {
              if (cancelled) return
              if (!containerRef.current) return
              bind(containerRef.current)
            })
          }
        } catch (err) {
          console.error(err)
          if (cancelled) return
          setSvg('')
        }
      }
      run()
      return () => {
        cancelled = true
      }
    }, [chart])

    if (!svg) {
      return (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
          Mermaid 渲染失败
        </div>
      )
    }

    return (
      <div
        ref={containerRef}
        className="not-prose overflow-x-auto"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    )
  }

  function ResolvedMarkdownImage(props: any) {
    const src = String(props.src || '')
    const alt = props.alt
    const title = props.title

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
    }, [src, rootPath, activeTabId, imageSrcCache])

    return <img src={resolvedSrc} alt={alt} title={title} />
  }

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 overflow-hidden font-sans">
        {/* Sidebar - Explorer */}
        <div className="w-64 bg-gray-100 border-r border-gray-200 flex flex-col shrink-0">
        <div className="p-4 border-b border-gray-200 bg-gray-100/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-200">
                <FileText size={18} />
              </div>
              <h1 className="font-bold text-lg tracking-tight">Notebook</h1>
            </div>
            {rootPath && (
              <div className="flex items-center gap-1 text-gray-400">
                <button onClick={() => createNewFile()} className="p-1 hover:bg-gray-200 rounded transition-all" title="New File"><FilePlus size={16} /></button>
                <button onClick={() => createNewFolder()} className="p-1 hover:bg-gray-200 rounded transition-all" title="New Folder"><FolderPlus size={16} /></button>
                <button onClick={() => uploadImage()} className="p-1 hover:bg-gray-200 rounded transition-all" title="Upload Image"><Upload size={16} /></button>
              </div>
            )}
          </div>
          {!rootPath && (
            <button 
              onClick={openFolder}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all shadow-sm active:scale-95"
            >
              <FolderOpen size={16} />
              打开文件夹
            </button>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-2 flex justify-between items-center">
            资源管理器
            {rootPath && <span className="text-[10px] lowercase font-normal opacity-60 truncate max-w-[100px]">{rootPath.split(/[\\/]/).filter(Boolean).pop()}</span>}
          </div>
          {fileTree.length > 0 ? (
            renderFileTree(fileTree)
          ) : (
            <div className="px-4 py-8 text-center">
              <p className="text-xs text-gray-400">Open a folder to start managing your files.</p>
            </div>
          )}
        </div>

        {/* Save Status Footer */}
        <div className="p-3 border-t border-gray-200 bg-gray-100/50 flex items-center justify-between text-[11px] text-gray-500">
          <div className="flex items-center gap-1.5">
            {saveStatus === 'saving' && <Clock size={12} className="animate-spin text-blue-500" />}
            {saveStatus === 'saved' && <CheckCircle size={12} className="text-green-500" />}
            {saveStatus === 'error' && <AlertCircle size={12} className="text-red-500" />}
            <span>
              {saveStatus === 'saving' ? '保存中...' : 
               saveStatus === 'saved' ? '已保存' : 
               saveStatus === 'error' ? '保存失败' : '就绪'}
            </span>
          </div>
          {activeTab?.lastSaved && (
            <span>{new Date(activeTab.lastSaved).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Tabs Bar */}
        <div className="h-10 bg-gray-100 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div className="flex items-center overflow-x-auto no-scrollbar flex-1 min-w-0">
            {openTabs.map(tab => (
              <div 
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                onDoubleClick={() => startRenameTab(tab)}
                className={cn(
                  "h-full px-4 flex items-center gap-2 border-r border-gray-200 cursor-pointer text-sm font-medium transition-all group min-w-[120px] max-w-[220px]",
                  activeTabId === tab.id ? "bg-white text-blue-600 shadow-[inset_0_2px_0_0_#2563eb]" : "text-gray-500 hover:bg-gray-200"
                )}
              >
                {tab.type === 'image' ? <ImageIcon size={14} className="text-purple-500" /> : <FileText size={14} className={tab.isDirty ? "text-orange-400" : "text-blue-500"} />}
                {renamingTabId === tab.id ? (
                  <input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRenameTab}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRenameTab()
                      if (e.key === 'Escape') cancelRenameTab()
                    }}
                    autoFocus
                    className="flex-1 min-w-0 bg-white border border-blue-200 rounded px-2 py-1 text-sm text-gray-800 focus:outline-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="truncate flex-1">{tab.name}</span>
                )}
                {tab.isDirty && <div className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />}
                <button 
                  onClick={(e) => closeTab(tab.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 rounded transition-all"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <button
              onClick={addNewTab}
              className="h-full px-3 flex items-center justify-center text-gray-500 hover:bg-gray-200 border-r border-gray-200 shrink-0"
              title="新建标签页"
            >
              <FilePlus size={16} />
            </button>
          </div>

          <div className="flex items-center gap-1 px-2 shrink-0">
            {activeTab?.type === 'markdown' && (
              <>
                <button
                  onClick={() => setViewMode('edit')}
                  className={cn("p-1.5 rounded-md transition-all", viewMode === 'edit' ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:text-gray-700")}
                  title="编辑"
                >
                  <Edit3 size={16} />
                </button>
                <button
                  onClick={() => setViewMode('split')}
                  className={cn("p-1.5 rounded-md transition-all", viewMode === 'split' ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:text-gray-700")}
                  title="分屏"
                >
                  <div className="flex gap-0.5">
                    <div className="w-1.5 h-3.5 border border-current rounded-[1px]"></div>
                    <div className="w-1.5 h-3.5 border border-current rounded-[1px]"></div>
                  </div>
                </button>
                <button
                  onClick={() => setViewMode('preview')}
                  className={cn("p-1.5 rounded-md transition-all", viewMode === 'preview' ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:text-gray-700")}
                  title="预览"
                >
                  <Eye size={16} />
                </button>
              </>
            )}
          </div>
        </div>

        {activeTab ? (
          <>
            <div className="flex-1 flex overflow-hidden">
              {activeTab.type === 'markdown' ? (
                <>
                  {(viewMode === 'edit' || viewMode === 'split') && (
                    <div className={cn("flex-1 h-full", viewMode === 'split' ? "border-r border-gray-200" : "")}>
                      <textarea 
                        ref={editorRef}
                        value={activeTab.content}
                        onChange={(e) => updateActiveContent(e.target.value)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={onDropToEditor}
                        className="w-full h-full p-8 resize-none focus:outline-none bg-white font-mono text-[14px] leading-relaxed text-gray-800"
                        placeholder="Start typing markdown..."
                      />
                    </div>
                  )}
                  {(viewMode === 'preview' || viewMode === 'split') && (
                    <div className="flex-1 h-full overflow-y-auto bg-gray-50/30">
                      <div 
                        ref={previewRef}
                        className="max-w-3xl mx-auto p-12 bg-white min-h-full shadow-sm ring-1 ring-gray-100 my-4 rounded-lg prose prose-slate prose-blue prose-headings:font-bold prose-a:text-blue-600 prose-pre:bg-gray-900 prose-pre:text-gray-100"
                      >
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            img: (props) => <ResolvedMarkdownImage {...props} />,
                            pre: ({ children }) => {
                              const child = Array.isArray(children) ? children[0] : children
                              if (
                                isValidElement(child) &&
                                typeof (child as any).props?.className === 'string' &&
                                (child as any).props.className.includes('language-mermaid')
                              ) {
                                const chart = String((child as any).props.children || '').replace(/\n$/, '')
                                return <MermaidDiagram chart={chart} />
                              }
                              return <pre>{children}</pre>
                            },
                          }}
                        >
                          {activeTab.content || '*No content yet*'}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center bg-gray-100/50 p-8 overflow-auto">
                  <div className="max-w-full max-h-full shadow-2xl rounded-lg overflow-hidden bg-white p-2">
                    <img src={activeTab.imageUrl} alt={activeTab.name} className="max-w-full max-h-full object-contain" />
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-300 flex-col gap-6 bg-gray-50/50">
            <div className="w-24 h-24 bg-white rounded-3xl shadow-xl flex items-center justify-center text-gray-200">
              <FolderOpen size={48} strokeWidth={1} />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold text-gray-500">Welcome to Notebook</h2>
              <p className="text-sm text-gray-400 mt-1">Open a folder to start managing and editing your files.</p>
            </div>
            <button 
              onClick={openFolder}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-bold rounded-full hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 active:scale-95"
            >
              <FolderOpen size={18} />
              Open Folder
            </button>
          </div>
        )}
      </div>
      {aboutOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[100]" onMouseDown={() => setAboutOpen(false)}>
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-gray-200 p-6" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-lg font-bold text-gray-900">关于</div>
              <button onClick={() => setAboutOpen(false)} className="p-1 rounded hover:bg-gray-100">
                <X size={16} />
              </button>
            </div>
            <div className="mt-3 text-sm text-gray-600 space-y-2">
              <div>软件：Markdown Notebook v1.0</div>
              <div>版本：v1.0</div>
              <div>作者：scold301</div>
              <div>
                GitHub：
                <a
                  className="text-blue-600 hover:underline ml-1"
                  href="https://github.com/scold301/markdown_editor"
                  target="_blank"
                  rel="noreferrer"
                >
                  https://github.com/scold301/markdown_editor
                </a>
              </div>
              <div>说明：本软件用于本地 Markdown/图片文件管理、编辑与导出。</div>
            </div>
            <div className="mt-6 flex justify-end">
              <button onClick={() => setAboutOpen(false)} className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-900 text-white hover:bg-gray-800">
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
