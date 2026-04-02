import { useRef, useCallback } from 'react'
import type { History } from '../types'
import { HISTORY_LIMIT } from '../lib/constants'

/**
 * 撤销/重做功能 Hook
 * @returns 撤销、重做、记录历史的函数
 */
export function useHistory() {
  const historyRef = useRef<Record<string, History>>({})

  /**
   * 记录历史
   * @param id 标签页 ID
   * @param content 当前内容
   */
  const recordHistory = useCallback((id: string, content: string) => {
    const history = (historyRef.current[id] ||= { past: [], future: [] })
    if (history.past.length === 0 || history.past[history.past.length - 1] !== content) {
      history.past.push(content)
      if (history.past.length > HISTORY_LIMIT) {
        history.past.shift()
      }
    }
    history.future = []
  }, [])

  /**
   * 撤销
   * @param id 标签页 ID
   * @param currentContent 当前内容
   * @returns 撤销后的内容，如果没有历史则返回 null
   */
  const undo = useCallback((id: string, currentContent: string): string | null => {
    const history = historyRef.current[id]
    if (!history || history.past.length === 0) return null
    
    const prev = history.past.pop()!
    history.future.push(currentContent)
    if (history.future.length > HISTORY_LIMIT) {
      history.future.shift()
    }
    return prev
  }, [])

  /**
   * 重做
   * @param id 标签页 ID
   * @param currentContent 当前内容
   * @returns 重做后的内容，如果没有未来记录则返回 null
   */
  const redo = useCallback((id: string, currentContent: string): string | null => {
    const history = historyRef.current[id]
    if (!history || history.future.length === 0) return null
    
    const next = history.future.pop()!
    history.past.push(currentContent)
    if (history.past.length > HISTORY_LIMIT) {
      history.past.shift()
    }
    return next
  }, [])

  /**
   * 清除指定标签页的历史
   * @param id 标签页 ID
   */
  const clearHistory = useCallback((id: string) => {
    delete historyRef.current[id]
  }, [])

  return {
    recordHistory,
    undo,
    redo,
    clearHistory,
  }
}
