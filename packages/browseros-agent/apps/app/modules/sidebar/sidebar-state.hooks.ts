import { useEffect, useState } from 'react'
import {
  DEFAULTS,
  type ItemsState,
  type SidebarSettings,
  type Space,
  type SpaceId,
  type SpacesState,
} from '@/lib/sidebar/core/types'
import {
  sidebarActiveSpaceIdStorage,
  sidebarItemsStorage,
  sidebarSettingsStorage,
  sidebarSpacesStorage,
  tabLinksStorage,
} from '@/lib/sidebar/storage'

const EMPTY_SPACES: SpacesState = { order: [], byId: {} }
const EMPTY_ITEMS: ItemsState = {
  byId: {},
  roots: { essentials: 'essentials' },
}

/**
 * The panel never writes the sidebar document: it reads the storage keys once
 * and then watches them, so the background reconciler stays the single writer.
 */
export function useSidebarState() {
  const [spaces, setSpaces] = useState<SpacesState>(EMPTY_SPACES)
  const [activeSpaceId, setActiveSpaceId] = useState<SpaceId | null>(null)
  const [items, setItems] = useState<ItemsState>(EMPTY_ITEMS)
  const [settings, setSettings] = useState<SidebarSettings>(DEFAULTS)
  const [tabLinks, setTabLinks] = useState<Record<string, string>>({})
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      sidebarSpacesStorage.getValue(),
      sidebarActiveSpaceIdStorage.getValue(),
      sidebarItemsStorage.getValue(),
      sidebarSettingsStorage.getValue(),
      tabLinksStorage.getValue(),
    ]).then(([nextSpaces, nextActive, nextItems, nextSettings, nextLinks]) => {
      if (cancelled) return
      setSpaces(nextSpaces ?? EMPTY_SPACES)
      setActiveSpaceId(nextActive ?? null)
      setItems(nextItems ?? EMPTY_ITEMS)
      setSettings({ ...DEFAULTS, ...nextSettings })
      setTabLinks(nextLinks ?? {})
      setReady(true)
    })
    const unwatch = [
      sidebarSpacesStorage.watch((next) => setSpaces(next ?? EMPTY_SPACES)),
      sidebarActiveSpaceIdStorage.watch((next) =>
        setActiveSpaceId(next ?? null),
      ),
      sidebarItemsStorage.watch((next) => setItems(next ?? EMPTY_ITEMS)),
      sidebarSettingsStorage.watch((next) =>
        setSettings({ ...DEFAULTS, ...(next ?? {}) }),
      ),
      tabLinksStorage.watch((next) => setTabLinks(next ?? {})),
    ]
    return () => {
      cancelled = true
      for (const stop of unwatch) stop()
    }
  }, [])

  const spaceList: Space[] = spaces.order.flatMap((id) =>
    spaces.byId[id] ? [spaces.byId[id]] : [],
  )
  const activeSpace = activeSpaceId ? spaces.byId[activeSpaceId] : undefined

  return {
    ready,
    spaces,
    spaceList,
    activeSpaceId,
    activeSpace,
    items,
    settings,
    tabLinks,
  }
}

/**
 * @public
 */
export type SidebarStateApi = ReturnType<typeof useSidebarState>
