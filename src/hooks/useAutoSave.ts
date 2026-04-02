import { useRef, useCallback, useEffect } from 'react'
import type { OpenTab } from '../types'

/**
 * 自动保存功能 Hook
 * @param activeTab 当前激活的标签页
 * @param autoSaveMinutes 自动保存间隔（分钟）
 * @param onSave 保存回调函数
 */
export function useAutoSave(
  activeTab: OpenTab | undefined,
  autoSaveMinutes: number,
  onSave: () => Promise<void>
) {
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * 触发自动保存
   */
  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }
    
    if (autoSaveMinutes > 0 && activeTab?.fsPath) {
      autoSaveTimerRef.current = setTimeout(() => {
        onSave()
      }, autoSaveMinutes * 60 * 1000)
    }
  }, [autoSaveMinutes, activeTab, onSave])

  /**
   * 清除自动保存定时器
   */
  const clearAutoSaveTimer = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      clearAutoSaveTimer()
    }
  }, [clearAutoSaveTimer])

  return {
    triggerAutoSave,
    clearAutoSaveTimer,
  }
}
