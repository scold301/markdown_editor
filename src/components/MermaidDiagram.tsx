import { useState, useEffect, useRef } from 'react'
import mermaid from 'mermaid'

interface MermaidDiagramProps {
  chart: string
}

/**
 * Mermaid 图表渲染组件
 * 用于在 Markdown 中渲染 Mermaid 流程图、时序图等
 */
export function MermaidDiagram({ chart }: MermaidDiagramProps) {
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
        (mermaid as any).initialize?.({
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
