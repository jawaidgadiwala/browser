import { useEffect, useRef, useState } from 'react'
import { type WindowRange, windowRange } from './sidebar-rows.helpers'

/** Panel width drives icon-only mode; the panel is user-resizable. */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return
    setWidth(element.clientWidth)
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, width }
}

/**
 * Minimal windowing: rows are fixed height, so the visible slice is pure
 * arithmetic and no dependency is needed.
 */
export function useWindowedRows<T extends HTMLElement>(
  count: number,
  rowHeight: number,
) {
  const ref = useRef<T | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    setViewportHeight(element.clientHeight)
    const onScroll = () => setScrollTop(element.scrollTop)
    element.addEventListener('scroll', onScroll, { passive: true })
    if (typeof ResizeObserver === 'undefined') {
      return () => element.removeEventListener('scroll', onScroll)
    }
    const observer = new ResizeObserver(() =>
      setViewportHeight(element.clientHeight),
    )
    observer.observe(element)
    return () => {
      element.removeEventListener('scroll', onScroll)
      observer.disconnect()
    }
  }, [])

  const range: WindowRange = windowRange(
    count,
    rowHeight,
    scrollTop,
    viewportHeight,
  )
  return {
    ref,
    range,
    totalHeight: count * rowHeight,
    offsetTop: range.start * rowHeight,
  }
}
