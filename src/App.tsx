import { useState, useEffect, useRef, useCallback } from 'react'
import { 
  FileText, Plus, Trash2, Download, Eye, Edit3, Save, 
  FileDown, FolderOpen, ChevronRight, ChevronDown, X, 
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

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']

interface FileItem {
  name: string
  kind: 'file' | 'directory'
  handle: FileSystemHandle
  path: string
  children?: FileItem[]
}

interface OpenTab {
  id: string
  name: string
  handle: FileSystemFileHandle
  content: string
  type: 'markdown' | 'image'
  imageUrl?: string
  isDirty: boolean
  lastSaved?: number
}

function App() {
  const [rootHandle, setRootHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [fileTree, setFileTree] = useState<FileItem[]>([])
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>('split')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const previewRef = useRef<HTMLDivElement>(null)
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)

  const activeTab = openTabs.find(t => t.id === activeTabId)

  // 递归获取文件树
  const getFileTree = async (dirHandle: FileSystemDirectoryHandle, currentPath = ''): Promise<FileItem[]> => {
    const items: FileItem[] = []
    for await (const entry of dirHandle.values()) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      
      const itemPath = currentPath ? `${currentPath}/${entry.name}` : entry.name
      const item: FileItem = {
        name: entry.name,
        kind: entry.kind,
        handle: entry,
        path: itemPath
      }

      if (entry.kind === 'directory') {
        item.children = await getFileTree(entry as FileSystemDirectoryHandle, itemPath)
      }
      items.push(item)
    }
    return items.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  const refreshFileTree = async () => {
    if (rootHandle) {
      const tree = await getFileTree(rootHandle)
      setFileTree(tree)
    }
  }

  const openFolder = async () => {
    try {
      const handle = await window.showDirectoryPicker()
      setRootHandle(handle)
      const tree = await getFileTree(handle)
      setFileTree(tree)
      setExpandedFolders(new Set([handle.name]))
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

  const openFile = async (fileHandle: FileSystemFileHandle, path: string) => {
    const existingTab = openTabs.find(t => t.id === path)
    if (existingTab) {
      setActiveTabId(existingTab.id)
      return
    }

    const file = await fileHandle.getFile()
    const isImage = IMAGE_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext))
    
    let content = ''
    let imageUrl = ''
    
    if (isImage) {
      imageUrl = URL.createObjectURL(file)
    } else {
      content = await file.text()
    }

    const newTab: OpenTab = {
      id: path,
      name: fileHandle.name,
      handle: fileHandle,
      content,
      type: isImage ? 'image' : 'markdown',
      imageUrl,
      isDirty: false,
      lastSaved: Date.now()
    }
    setOpenTabs([...openTabs, newTab])
    setActiveTabId(newTab.id)
  }

  const createNewFile = async (parentHandle?: FileSystemDirectoryHandle, parentPath = '') => {
    const handle = parentHandle || rootHandle
    if (!handle) return
    
    try {
      const fileName = prompt('Enter file name (e.g., new_note.md):', 'new_note.md')
      if (!fileName) return
      
      const fileHandle = await handle.getFileHandle(fileName, { create: true })
      await refreshFileTree()
      const newPath = parentPath ? `${parentPath}/${fileName}` : fileName
      await openFile(fileHandle, newPath)
    } catch (err) {
      console.error('Failed to create file:', err)
    }
  }

  const createNewFolder = async (parentHandle?: FileSystemDirectoryHandle) => {
    const handle = parentHandle || rootHandle
    if (!handle) return
    
    try {
      const folderName = prompt('Enter folder name:')
      if (!folderName) return
      
      await handle.getDirectoryHandle(folderName, { create: true })
      await refreshFileTree()
    } catch (err) {
      console.error('Failed to create folder:', err)
    }
  }

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const tabToClose = openTabs.find(t => t.id === id)
    if (tabToClose?.imageUrl) {
      URL.revokeObjectURL(tabToClose.imageUrl)
    }
    
    const newTabs = openTabs.filter(t => t.id !== id)
    setOpenTabs(newTabs)
    if (activeTabId === id) {
      setActiveTabId(newTabs[newTabs.length - 1]?.id || null)
    }
  }

  const updateActiveContent = (content: string) => {
    if (!activeTabId || activeTab?.type !== 'markdown') return
    setOpenTabs(tabs => tabs.map(t => 
      t.id === activeTabId ? { ...t, content, isDirty: true } : t
    ))
    
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      saveActiveFile()
    }, 3000)
  }

  const saveActiveFile = async () => {
    if (!activeTab || !activeTab.isDirty || activeTab.type !== 'markdown') return
    
    setSaveStatus('saving')
    try {
      const writable = await activeTab.handle.createWritable()
      await writable.write(activeTab.content)
      await writable.close()
      
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
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        saveActiveFile()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTab])

  const deleteItem = async (item: FileItem, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!rootHandle) return
    
    const confirmDelete = confirm(`Are you sure you want to delete ${item.name}?`)
    if (!confirmDelete) return

    try {
      const pathParts = item.path.split('/')
      pathParts.pop()
      
      let parentHandle: FileSystemDirectoryHandle = rootHandle
      for (const part of pathParts) {
        if (part === rootHandle.name) continue
        parentHandle = await parentHandle.getDirectoryHandle(part)
      }

      await parentHandle.removeEntry(item.name, { recursive: item.kind === 'directory' })
      
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

  const uploadImage = async (parentHandle?: FileSystemDirectoryHandle, parentPath = '') => {
    const handle = parentHandle || rootHandle
    if (!handle) return

    try {
      const [fileHandle] = await window.showOpenFilePicker({
        types: [{
          description: 'Images',
          accept: { 'image/*': IMAGE_EXTENSIONS }
        }]
      })
      
      const file = await fileHandle.getFile()
      const newFileHandle = await handle.getFileHandle(file.name, { create: true })
      const writable = await newFileHandle.createWritable()
      await writable.write(file)
      await writable.close()
      
      await refreshFileTree()
      const newPath = parentPath ? `${parentPath}/${file.name}` : file.name
      await openFile(newFileHandle, newPath)
    } catch (err) {
      console.error('Failed to upload image:', err)
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
            onClick={(e) => item.kind === 'directory' ? toggleFolder(item.path, e) : openFile(item.handle as FileSystemFileHandle, item.path)}
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
                  <button onClick={(e) => { e.stopPropagation(); createNewFile(item.handle as FileSystemDirectoryHandle, item.path) }} title="New File" className="hover:text-blue-500"><FilePlus size={12} /></button>
                  <button onClick={(e) => { e.stopPropagation(); createNewFolder(item.handle as FileSystemDirectoryHandle) }} title="New Folder" className="hover:text-blue-500"><FolderPlus size={12} /></button>
                  <button onClick={(e) => { e.stopPropagation(); uploadImage(item.handle as FileSystemDirectoryHandle, item.path) }} title="Upload Image" className="hover:text-blue-500"><Upload size={12} /></button>
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
    if (!previewRef.current || !activeTab || activeTab.type !== 'markdown') return
    const canvas = await html2canvas(previewRef.current, { scale: 2, useCORS: true })
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF('p', 'mm', 'a4')
    const pdfWidth = pdf.internal.pageSize.getWidth()
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
    pdf.save(`${activeTab.name}.pdf`)
  }

  const exportWord = () => {
    if (!activeTab || activeTab.type !== 'markdown') return
    const content = `<html><body>${previewRef.current?.innerHTML || ''}</body></html>`
    const blob = new Blob(['\ufeff', content], { type: 'application/msword' })
    saveAs(blob, `${activeTab.name}.doc`)
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
            {rootHandle && (
              <div className="flex items-center gap-1 text-gray-400">
                <button onClick={() => createNewFile()} className="p-1 hover:bg-gray-200 rounded transition-all" title="New File"><FilePlus size={16} /></button>
                <button onClick={() => createNewFolder()} className="p-1 hover:bg-gray-200 rounded transition-all" title="New Folder"><FolderPlus size={16} /></button>
                <button onClick={() => uploadImage()} className="p-1 hover:bg-gray-200 rounded transition-all" title="Upload Image"><Upload size={16} /></button>
              </div>
            )}
          </div>
          {!rootHandle && (
            <button 
              onClick={openFolder}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all shadow-sm active:scale-95"
            >
              <FolderOpen size={16} />
              Open Folder
            </button>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-2 flex justify-between items-center">
            Explorer
            {rootHandle && <span className="text-[10px] lowercase font-normal opacity-60 truncate max-w-[100px]">{rootHandle.name}</span>}
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
              {saveStatus === 'saving' ? 'Saving...' : 
               saveStatus === 'saved' ? 'Saved' : 
               saveStatus === 'error' ? 'Save Error' : 'Ready'}
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
        <div className="h-10 bg-gray-100 border-b border-gray-200 flex items-center overflow-x-auto no-scrollbar shrink-0">
          {openTabs.map(tab => (
            <div 
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={cn(
                "h-full px-4 flex items-center gap-2 border-r border-gray-200 cursor-pointer text-sm font-medium transition-all group min-w-[120px] max-w-[200px]",
                activeTabId === tab.id ? "bg-white text-blue-600 shadow-[inset_0_2px_0_0_#2563eb]" : "text-gray-500 hover:bg-gray-200"
              )}
            >
              {tab.type === 'image' ? <ImageIcon size={14} className="text-purple-500" /> : <FileText size={14} className={tab.isDirty ? "text-orange-400" : "text-blue-500"} />}
              <span className="truncate flex-1">{tab.name}</span>
              {tab.isDirty && <div className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />}
              <button 
                onClick={(e) => closeTab(tab.id, e)}
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 rounded transition-all"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>

        {activeTab ? (
          <>
            <div className="h-14 border-b border-gray-200 flex items-center justify-between px-6 bg-white shrink-0">
              <div className="flex items-center flex-1 mr-4">
                <h2 className="text-lg font-bold text-gray-800 truncate">{activeTab.name}</h2>
              </div>
              
              {activeTab.type === 'markdown' && (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
                    <button 
                      onClick={() => setViewMode('edit')}
                      className={cn("p-1.5 rounded-md transition-all flex items-center gap-1.5 px-2.5", 
                        viewMode === 'edit' ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:text-gray-700")}
                    >
                      <Edit3 size={16} />
                      <span className="text-xs font-semibold">Edit</span>
                    </button>
                    <button 
                      onClick={() => setViewMode('split')}
                      className={cn("p-1.5 rounded-md transition-all flex items-center gap-1.5 px-2.5", 
                        viewMode === 'split' ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:text-gray-700")}
                    >
                      <div className="flex gap-0.5">
                        <div className="w-1.5 h-3.5 border border-current rounded-[1px]"></div>
                        <div className="w-1.5 h-3.5 border border-current rounded-[1px]"></div>
                      </div>
                      <span className="text-xs font-semibold">Split</span>
                    </button>
                    <button 
                      onClick={() => setViewMode('preview')}
                      className={cn("p-1.5 rounded-md transition-all flex items-center gap-1.5 px-2.5", 
                        viewMode === 'preview' ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:text-gray-700")}
                    >
                      <Eye size={16} />
                      <span className="text-xs font-semibold">Preview</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2 border-l pl-4 border-gray-200">
                    <button 
                      onClick={saveActiveFile}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-md transition-all border active:scale-95",
                        activeTab.isDirty ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700" : "text-gray-400 border-gray-200 cursor-not-allowed"
                      )}
                    >
                      <Save size={16} />
                      Save
                    </button>
                    <div className="relative group">
                      <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded-md transition-all border border-gray-200 active:scale-95">
                        <Download size={16} />
                        Export
                      </button>
                      <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 overflow-hidden">
                        <button onClick={exportPDF} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700">
                          <FileDown size={14} className="text-red-500" /> Export PDF
                        </button>
                        <button onClick={exportWord} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700">
                          <FileDown size={14} className="text-blue-500" /> Export Word
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 flex overflow-hidden">
              {activeTab.type === 'markdown' ? (
                <>
                  {(viewMode === 'edit' || viewMode === 'split') && (
                    <div className={cn("flex-1 h-full", viewMode === 'split' ? "border-r border-gray-200" : "")}>
                      <textarea 
                        value={activeTab.content}
                        onChange={(e) => updateActiveContent(e.target.value)}
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
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
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
    </div>
  )
}

export default App
