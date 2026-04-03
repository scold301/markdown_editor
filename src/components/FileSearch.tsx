import { useState, useEffect, useRef, useMemo } from 'react'
import { Search, X, FileText, Folder, Image as ImageIcon } from 'lucide-react'
import { FileItem } from '../types'
import { IMAGE_EXTENSIONS } from '../lib/constants'

interface FileSearchProps {
  fileTree: FileItem[]
  onSelectFile: (path: string) => void
  onClose: () => void
}

interface SearchResult {
  name: string
  path: string
  kind: 'file' | 'directory'
  isImage: boolean
  isMarkdown: boolean
}

function FileSearch({ fileTree, onSelectFile, onClose }: FileSearchProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const flattenTree = (items: FileItem[], results: SearchResult[] = []): SearchResult[] => {
    for (const item of items) {
      const lower = item.name.toLowerCase()
      const isImage = IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext))
      const isMarkdown = lower.endsWith('.md')
      
      results.push({
        name: item.name,
        path: item.path,
        kind: item.kind,
        isImage,
        isMarkdown
      })
      
      if (item.children) {
        flattenTree(item.children, results)
      }
    }
    return results
  }

  const allFiles = useMemo(() => flattenTree(fileTree), [fileTree])

  const searchResults = useMemo(() => {
    if (!query.trim()) return allFiles.slice(0, 50)
    
    const lowerQuery = query.toLowerCase()
    return allFiles
      .filter(item => item.name.toLowerCase().includes(lowerQuery) || 
                      item.path.toLowerCase().includes(lowerQuery))
      .slice(0, 50)
  }, [query, allFiles])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, searchResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const selected = searchResults[selectedIndex]
      if (selected && selected.kind === 'file') {
        onSelectFile(selected.path)
        onClose()
      }
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  const handleSelect = (item: SearchResult) => {
    if (item.kind === 'file') {
      onSelectFile(item.path)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-20 z-50" onClick={onClose}>
      <div 
        className="w-full max-w-xl bg-white dark:bg-gray-800 rounded-lg shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 p-3 border-b border-gray-200 dark:border-gray-700">
          <Search size={18} className="text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索文件..."
            className="flex-1 bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400"
          />
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            <X size={16} className="text-gray-400" />
          </button>
        </div>
        
        <div className="max-h-80 overflow-y-auto">
          {searchResults.length === 0 ? (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">
              未找到匹配的文件
            </div>
          ) : (
            searchResults.map((item, index) => (
              <div
                key={item.path}
                onClick={() => handleSelect(item)}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                  index === selectedIndex 
                    ? 'bg-blue-50 dark:bg-blue-900/30' 
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                {item.kind === 'directory' ? (
                  <Folder size={16} className="text-yellow-500" />
                ) : item.isImage ? (
                  <ImageIcon size={16} className="text-purple-500" />
                ) : item.isMarkdown ? (
                  <FileText size={16} className="text-blue-500" />
                ) : (
                  <FileText size={16} className="text-gray-400" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {item.name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {item.path}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        
        <div className="p-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 flex items-center justify-between">
          <span>↑↓ 选择 · Enter 打开 · Esc 关闭</span>
          <span>{searchResults.length} 个结果</span>
        </div>
      </div>
    </div>
  )
}

export default FileSearch
