import { useMemo, useCallback } from 'react'
import { 
  ChevronRight, 
  ChevronDown, 
  FileText, 
  File, 
  FolderPlus, 
  FilePlus, 
  Upload,
  Trash2,
  Image as ImageIcon
} from 'lucide-react'
import { FileItem } from '../types'
import { IMAGE_EXTENSIONS } from '../lib/constants'

interface VirtualizedFileTreeProps {
  items: FileItem[]
  activeTabId: string | null
  expandedFolders: Set<string>
  onToggleFolder: (path: string, e: React.MouseEvent) => void
  onOpenFile: (path: string) => void
  onCreateFile: (parentPath: string) => void
  onCreateFolder: (parentPath: string) => void
  onUploadImage: (parentPath: string) => void
  onDeleteItem: (item: FileItem, e: React.MouseEvent) => void
  onDragStartImage: (e: React.DragEvent, path: string) => void
}

interface FlatItem extends FileItem {
  depth: number
  visible: boolean
}

function VirtualizedFileTree({
  items,
  activeTabId,
  expandedFolders,
  onToggleFolder,
  onOpenFile,
  onCreateFile,
  onCreateFolder,
  onUploadImage,
  onDeleteItem,
  onDragStartImage
}: VirtualizedFileTreeProps) {
  const flattenTree = useCallback((treeItems: FileItem[], depth = 0): FlatItem[] => {
    const result: FlatItem[] = []
    
    for (const item of treeItems) {
      const isExpanded = expandedFolders.has(item.path)
      result.push({ ...item, depth, visible: true })
      
      if (item.kind === 'directory' && isExpanded && item.children) {
        result.push(...flattenTree(item.children, depth + 1))
      }
    }
    
    return result
  }, [expandedFolders])

  const flatItems = useMemo(() => flattenTree(items), [items, flattenTree])

  const handleItemClick = (item: FileItem, e: React.MouseEvent) => {
    if (item.kind === 'directory') {
      onToggleFolder(item.path, e)
    } else {
      onOpenFile(item.path)
    }
  }

  return (
    <div className="py-1">
      {flatItems.map((item) => {
        const isExpanded = expandedFolders.has(item.path)
        const isImage = IMAGE_EXTENSIONS.some(ext => item.name.toLowerCase().endsWith(ext))
        const isMarkdown = item.name.toLowerCase().endsWith('.md')

        return (
          <div 
            key={item.path}
            onClick={(e) => handleItemClick(item, e)}
            draggable={item.kind === 'file' && isImage}
            onDragStart={(e) => {
              if (item.kind === 'file' && isImage) {
                onDragStartImage(e, item.path)
              }
            }}
            className={`flex items-center gap-1.5 py-1 px-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer rounded text-sm transition-colors group ${
              activeTabId === item.path 
                ? 'bg-white dark:bg-gray-600 shadow-sm text-blue-600 dark:text-blue-400 font-medium' 
                : 'text-gray-600 dark:text-gray-300'
            }`}
            style={{ paddingLeft: `${item.depth * 12 + 8}px` }}
          >
            {item.kind === 'directory' ? (
              <>
                {isExpanded ? (
                  <ChevronDown size={14} className="text-gray-400 dark:text-gray-500" />
                ) : (
                  <ChevronRight size={14} className="text-gray-400 dark:text-gray-500" />
                )}
                <span className="truncate flex-1">{item.name}</span>
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-gray-400 dark:text-gray-500">
                  <button 
                    onClick={(e) => { e.stopPropagation(); onCreateFile(item.path) }} 
                    title="新建文件" 
                    className="hover:text-blue-500 dark:hover:text-blue-400"
                  >
                    <FilePlus size={12} />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onCreateFolder(item.path) }} 
                    title="新建文件夹" 
                    className="hover:text-blue-500 dark:hover:text-blue-400"
                  >
                    <FolderPlus size={12} />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onUploadImage(item.path) }} 
                    title="上传图片" 
                    className="hover:text-blue-500 dark:hover:text-blue-400"
                  >
                    <Upload size={12} />
                  </button>
                  <button 
                    onClick={(e) => onDeleteItem(item, e)} 
                    title="删除" 
                    className="hover:text-red-500 dark:hover:text-red-400"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </>
            ) : (
              <>
                {isImage ? (
                  <ImageIcon size={14} className="text-purple-500" />
                ) : isMarkdown ? (
                  <FileText size={14} className="text-blue-500" />
                ) : (
                  <File size={14} className="text-gray-400" />
                )}
                <span className="truncate flex-1">{item.name}</span>
                <button 
                  onClick={(e) => onDeleteItem(item, e)}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-all"
                  title="删除"
                >
                  <Trash2 size={12} />
                </button>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default VirtualizedFileTree
