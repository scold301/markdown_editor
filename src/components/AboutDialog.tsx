import { X } from 'lucide-react'

interface AboutDialogProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * 关于对话框组件
 */
export function AboutDialog({ isOpen, onClose }: AboutDialogProps) {
  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[100]" 
      onMouseDown={onClose}
    >
      <div 
        className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-gray-200 p-6" 
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="text-lg font-bold text-gray-900">关于</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
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
          <button 
            onClick={onClose} 
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-900 text-white hover:bg-gray-800"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  )
}
