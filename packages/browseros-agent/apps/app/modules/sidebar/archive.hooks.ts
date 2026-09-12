import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { ArchivedItem, Space, SpaceId } from '@/lib/sidebar/core/types'
import {
  sidebarActiveSpaceIdStorage,
  sidebarArchiveStorage,
  sidebarSpacesStorage,
} from '@/lib/sidebar/storage'
import { archiveActions } from './archive.actions'
import {
  ARCHIVE_ROW_HEIGHT,
  type ArchiveRow,
  layoutRows,
  newEntries,
  type RowRange,
  toastBatches,
  visibleRange,
} from './archive.helpers'

/**
 * The panel never writes the sidebar document: it reads `sidebar:archive`
 * once and then watches it, so the background stays the single writer.
 */
export function useArchive() {
  const [entries, setEntries] = useState<ArchivedItem[]>([])
  const [spaces, setSpaces] = useState<Record<SpaceId, Space>>({})
  const [activeSpaceId, setActiveSpaceId] = useState<SpaceId | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      sidebarArchiveStorage.getValue(),
      sidebarSpacesStorage.getValue(),
      sidebarActiveSpaceIdStorage.getValue(),
    ]).then(([archive, spacesState, active]) => {
      if (cancelled) return
      setEntries(archive ?? [])
      setSpaces(spacesState?.byId ?? {})
      setActiveSpaceId(active ?? null)
      setReady(true)
    })
    const unwatch = [
      sidebarArchiveStorage.watch((next) => setEntries(next ?? [])),
      sidebarSpacesStorage.watch((next) => setSpaces(next?.byId ?? {})),
      sidebarActiveSpaceIdStorage.watch((next) =>
        setActiveSpaceId(next ?? null),
      ),
    ]
    return () => {
      cancelled = true
      for (const stop of unwatch) stop()
    }
  }, [])

  return { ready, entries, spaces, activeSpaceId }
}

/** Badge source for the footer: how much the last day archived. */
export function useArchiveCount() {
  const [entries, setEntries] = useState<ArchivedItem[]>([])

  useEffect(() => {
    let cancelled = false
    sidebarArchiveStorage.getValue().then((next) => {
      if (!cancelled) setEntries(next ?? [])
    })
    const unwatch = sidebarArchiveStorage.watch((next) =>
      setEntries(next ?? []),
    )
    return () => {
      cancelled = true
      unwatch()
    }
  }, [])

  return entries
}

/**
 * Watches the archive for fresh Tidy / Clear runs and offers one Undo per
 * run. The first read seeds the baseline so mounting never toasts history.
 */
export function useArchiveToast() {
  const previous = useRef<ArchivedItem[] | null>(null)

  useEffect(() => {
    let cancelled = false
    sidebarArchiveStorage.getValue().then((next) => {
      if (!cancelled) previous.current = next ?? []
    })
    const unwatch = sidebarArchiveStorage.watch((next) => {
      const current = next ?? []
      const before = previous.current
      previous.current = current
      if (before === null) return
      for (const batch of toastBatches(newEntries(before, current))) {
        toast(`Archived ${batch.length} tab${batch.length === 1 ? '' : 's'}`, {
          action: {
            label: 'Undo',
            onClick: () => void archiveActions.restoreMany(batch),
          },
        })
      }
    })
    return () => {
      cancelled = true
      unwatch()
    }
  }, [])
}

/**
 * Windowing for the archive list. Rows have two heights (day headers and
 * entries), so the visible slice comes off a prefix-offset scan.
 */
export function useWindowedArchive<T extends HTMLElement>(rows: ArchiveRow[]) {
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

  const layout = layoutRows(rows)
  const range: RowRange = visibleRange(layout, scrollTop, viewportHeight)
  return {
    ref,
    range,
    totalHeight: layout.total,
    offsetTop: layout.tops[range.start] ?? 0,
    rowHeight: ARCHIVE_ROW_HEIGHT,
  }
}
