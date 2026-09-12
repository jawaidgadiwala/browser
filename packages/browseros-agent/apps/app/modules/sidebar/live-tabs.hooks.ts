import { useEffect, useState } from 'react'
import type { LiveGroup, LiveTab } from './sidebar-rows.helpers'

/**
 * Live tab lists are not part of the sidebar document: they are read straight
 * from the browser and re-read on tab events. Reads only — every mutation
 * goes through the background via `sendSidebarMessage`.
 */

const REFRESH_DEBOUNCE_MS = 50

interface LiveTabsSnapshot {
  windowId: number
  tabs: LiveTab[]
  groups: LiveGroup[]
  ready: boolean
}

/** `chrome.windows.WINDOW_ID_CURRENT`, inlined so the module loads anywhere. */
const WINDOW_ID_CURRENT = -2

const EMPTY: LiveTabsSnapshot = {
  windowId: WINDOW_ID_CURRENT,
  tabs: [],
  groups: [],
  ready: false,
}

/** The chrome event objects differ in listener shape; we only need the ping. */
interface PingEvent {
  addListener: (callback: () => void) => void
  removeListener: (callback: () => void) => void
}

export function useLiveTabs(windowId?: number): LiveTabsSnapshot {
  const [snapshot, setSnapshot] = useState<LiveTabsSnapshot>(EMPTY)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const read = async () => {
      const query =
        windowId === undefined ? { currentWindow: true } : { windowId }
      const tabs = await chrome.tabs.query(query)
      const resolvedWindowId = windowId ?? tabs[0]?.windowId
      const groups = await chrome.tabGroups.query(
        resolvedWindowId === undefined ? {} : { windowId: resolvedWindowId },
      )
      if (cancelled) return
      setSnapshot({
        windowId: resolvedWindowId ?? EMPTY.windowId,
        tabs: tabs as LiveTab[],
        groups: groups as LiveGroup[],
        ready: true,
      })
    }

    const refresh = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        read()
      }, REFRESH_DEBOUNCE_MS)
    }

    read()

    const events = [
      chrome.tabs.onCreated,
      chrome.tabs.onRemoved,
      chrome.tabs.onUpdated,
      chrome.tabs.onMoved,
      chrome.tabs.onActivated,
      chrome.tabs.onAttached,
      chrome.tabs.onDetached,
      chrome.tabs.onReplaced,
      chrome.tabGroups?.onCreated,
      chrome.tabGroups?.onUpdated,
      chrome.tabGroups?.onRemoved,
      chrome.tabGroups?.onMoved,
    ].filter(Boolean) as unknown as PingEvent[]
    for (const event of events) event.addListener(refresh)

    return () => {
      cancelled = true
      clearTimeout(timer)
      for (const event of events) event.removeListener(refresh)
    }
  }, [windowId])

  return snapshot
}
