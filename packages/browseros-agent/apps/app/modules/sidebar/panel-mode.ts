import { storage } from '@wxt-dev/storage'
import { useEffect, useState } from 'react'

/**
 * One side panel per window, two surfaces in it. The preference is persisted
 * so reopening the panel lands on whatever the user was last using.
 *
 * @public
 */
export type PanelMode = 'sidebar' | 'chat'

export const DEFAULT_PANEL_MODE: PanelMode = 'sidebar'

export const panelModeStorage = storage.defineItem<PanelMode>(
  'local:sidepanelMode',
  { fallback: DEFAULT_PANEL_MODE },
)

export function routeForMode(mode: PanelMode): string {
  return mode === 'chat' ? '/chat' : '/sidebar'
}

export function otherMode(mode: PanelMode): PanelMode {
  return mode === 'chat' ? 'sidebar' : 'chat'
}

/** Hash routes outside the sidebar (history, deep links) count as chat. */
export function modeForPath(path: string): PanelMode {
  return path.startsWith('/sidebar') ? 'sidebar' : 'chat'
}

export async function setPanelMode(mode: PanelMode): Promise<void> {
  await panelModeStorage.setValue(mode)
}

export function usePanelMode() {
  const [mode, setMode] = useState<PanelMode>(DEFAULT_PANEL_MODE)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    panelModeStorage.getValue().then((value) => {
      if (cancelled) return
      setMode(value ?? DEFAULT_PANEL_MODE)
      setReady(true)
    })
    const unwatch = panelModeStorage.watch((next) =>
      setMode(next ?? DEFAULT_PANEL_MODE),
    )
    return () => {
      cancelled = true
      unwatch()
    }
  }, [])

  return { mode, ready }
}
