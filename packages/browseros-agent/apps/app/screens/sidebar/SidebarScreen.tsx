import { type FC, useState } from 'react'
import { useNavigate } from 'react-router'
import { SidebarDndContext } from '@/components/sidebar/dnd/SidebarDndContext'
import { EssentialsGrid } from '@/components/sidebar/panel/EssentialsGrid'
import { FooterBar } from '@/components/sidebar/panel/FooterBar'
import { PinnedList } from '@/components/sidebar/panel/PinnedList'
import { SearchBox } from '@/components/sidebar/panel/SearchBox'
import { Separator } from '@/components/sidebar/panel/Separator'
import { SidebarRoot } from '@/components/sidebar/panel/SidebarRoot'
import { SpaceHeader } from '@/components/sidebar/panel/SpaceHeader'
import { TodayList } from '@/components/sidebar/panel/TodayList'
import type { SpaceDialogValues } from '@/components/spaces/SpaceDialog'
import {
  adjacentSpace,
  essentialsList,
  isDrifted,
  pinnedTree,
} from '@/lib/sidebar/core/selectors'
import { computeTheme, themeSpecForColor } from '@/lib/sidebar/core/theme'
import type {
  ItemId,
  ItemsState,
  SidebarState,
  SpaceId,
} from '@/lib/sidebar/core/types'
import { useLiveTabs } from '@/modules/sidebar/live-tabs.hooks'
import { setPanelMode } from '@/modules/sidebar/panel-mode'
import { openUrlInTab, sidebarActions } from '@/modules/sidebar/sidebar-actions'
import { useElementWidth } from '@/modules/sidebar/sidebar-layout.hooks'
import {
  groupIdForSpace,
  isIconOnly,
  pinnedUrls,
  searchRows,
  todayRows,
} from '@/modules/sidebar/sidebar-rows.helpers'
import { useSidebarState } from '@/modules/sidebar/sidebar-state.hooks'

const SETTINGS_URL = '/app.html#/settings/spaces'
const DOWNLOADS_URL = 'chrome://downloads'
const NEW_FOLDER_TITLE = 'New folder'

/**
 * The sidebar surface of the side panel. It only reads state: every mutation
 * is an intent sent to the background reconciler.
 */
export const SidebarScreen: FC = () => {
  const navigate = useNavigate()
  const {
    ready,
    spaces,
    spaceList,
    activeSpaceId,
    activeSpace,
    items,
    settings,
    tabLinks,
  } = useSidebarState()
  const live = useLiveTabs()
  const [query, setQuery] = useState('')
  const { ref, width } = useElementWidth<HTMLDivElement>()
  const iconOnly = isIconOnly(width)

  const theme = computeTheme(
    activeSpace?.theme ?? themeSpecForColor(activeSpace?.color ?? 'grey'),
  )

  const state: SidebarState = {
    spaces,
    activeSpaceId,
    items,
    archive: [],
    settings,
  }

  const groupId = activeSpace
    ? groupIdForSpace(live.groups, activeSpace, live.windowId)
    : null
  const pinned = activeSpace
    ? pinnedUrls(items, activeSpace)
    : new Set<string>()
  const today = todayRows(live.tabs, groupId, pinned)
  const results = searchRows(
    live.tabs,
    live.groups,
    spaceList,
    activeSpaceId,
    query,
    live.windowId,
  )
  const rows = query.trim() ? results : today

  const activeItemId = activeLinkedItemId(tabLinks, live.tabs)
  const pinnedRows = activeSpace
    ? pinnedTree(state, activeSpace.id, activeItemId)
    : []
  const driftedIds = driftedPinnedIds(state, tabLinks, live.tabs)
  const essentials = essentialsList(state)

  const switchTo = (direction: -1 | 1) => {
    const target = adjacentSpace(
      spaces.order,
      activeSpaceId,
      direction,
      settings.wrapAround,
    )
    if (target) sidebarActions.switchSpace(target)
  }

  const openChat = () => {
    setPanelMode('chat')
    navigate('/chat')
  }

  const createSpace = async (values: SpaceDialogValues) => {
    await sidebarActions.createSpace({ ...values, switchTo: true })
  }

  const closePinned = (itemId: ItemId) => {
    const entry = Object.entries(tabLinks).find(([, id]) => id === itemId)
    if (!entry) return
    sidebarActions.closeTabs([Number(entry[0])], 'sidebar-pinned-close')
  }

  if (!ready) return null

  return (
    <SidebarRoot
      ref={ref}
      theme={theme}
      onNextSpace={() => switchTo(1)}
      onPrevSpace={() => switchTo(-1)}
      onToggleMode={openChat}
    >
      <SidebarDndContext>
        <SearchBox
          value={query}
          onChange={setQuery}
          iconOnly={iconOnly}
          onSubmit={() => {
            const first = rows[0]
            if (first) sidebarActions.activateTab(first.tabId)
          }}
        />
        <EssentialsGrid
          rootId={items.roots.essentials}
          items={essentials}
          iconOnly={iconOnly}
          onOpen={(itemId) => sidebarActions.openItem(itemId)}
          onRemove={(itemId) => sidebarActions.removeEssential(itemId)}
        />
        <div
          key={activeSpaceId ?? 'none'}
          className="sb-space-strip flex min-h-0 flex-1 flex-col"
        >
          {activeSpace ? (
            <>
              <SpaceHeader
                space={activeSpace}
                iconOnly={iconOnly}
                onToggleCollapsed={() =>
                  sidebarActions.updateSpace({
                    spaceId: activeSpace.id,
                    pinnedCollapsed: !activeSpace.pinnedCollapsed,
                  })
                }
                onRename={(name) =>
                  sidebarActions.updateSpace({ spaceId: activeSpace.id, name })
                }
                onAssignActiveTab={() =>
                  sidebarActions.assignActiveTab(activeSpace.id)
                }
                onAdoptLooseTabs={() =>
                  sidebarActions.adoptLooseTabs(activeSpace.id)
                }
                onNewFolder={() =>
                  sidebarActions.createFolder(activeSpace.id, NEW_FOLDER_TITLE)
                }
              />
              {!activeSpace.pinnedCollapsed && (
                <PinnedList
                  rows={pinnedRows}
                  items={items}
                  pinnedRootId={activeSpace.containers.pinned}
                  driftedIds={driftedIds}
                  activeFolderIds={folderPath(items, activeItemId)}
                  activeItemId={activeItemId}
                  iconOnly={iconOnly}
                  onOpen={(itemId) => sidebarActions.openItem(itemId)}
                  onSetExpansion={(itemId, expansion) =>
                    sidebarActions.setExpansion(itemId, expansion)
                  }
                  onReset={(itemId) => sidebarActions.resetPinned(itemId)}
                  onUnpin={(itemId) => sidebarActions.unpinItem(itemId)}
                  onRename={(itemId, title) =>
                    sidebarActions.renameItem(itemId, title)
                  }
                  onAddEssential={(url, title) =>
                    sidebarActions.addEssential({ url, title })
                  }
                  onNewFolder={(parentId) =>
                    sidebarActions.createFolder(
                      activeSpace.id,
                      NEW_FOLDER_TITLE,
                      parentId,
                    )
                  }
                  onClosePinned={closePinned}
                />
              )}
              <Separator
                iconOnly={iconOnly}
                onNewTab={() => sidebarActions.newTab(activeSpace.id)}
                onTidy={() => sidebarActions.tidy(activeSpace.id)}
                onClear={() => sidebarActions.clear(activeSpace.id)}
              />
            </>
          ) : (
            <p className="px-3 py-4 text-xs opacity-70">
              No space yet. Use + below to create one.
            </p>
          )}
          <TodayList
            rows={rows}
            iconOnly={iconOnly}
            emptyLabel={
              query.trim() ? 'No tabs match' : 'No tabs in this space yet'
            }
            onActivate={(tabId) => sidebarActions.activateTab(tabId)}
            onClose={(tabId) =>
              sidebarActions.closeTabs([tabId], 'sidebar-row-close')
            }
            onPin={(tabId) => sidebarActions.pinTab({ tabId })}
            onAddEssential={(tabId) => sidebarActions.addEssential({ tabId })}
          />
        </div>
      </SidebarDndContext>
      <FooterBar
        spaces={spaceList}
        activeSpaceId={activeSpaceId}
        onSwitch={(spaceId: SpaceId) => sidebarActions.switchSpace(spaceId)}
        onCreate={createSpace}
        onOpenSettings={() => openUrlInTab(chrome.runtime.getURL(SETTINGS_URL))}
        onOpenDownloads={() => openUrlInTab(DOWNLOADS_URL)}
        onOpenChat={openChat}
      />
    </SidebarRoot>
  )
}

/** The pinned or essential node the active tab stands for, when there is one. */
function activeLinkedItemId(
  tabLinks: Record<string, string>,
  tabs: { id?: number; active?: boolean }[],
): ItemId | undefined {
  const active = tabs.find((tab) => tab.active && tab.id !== undefined)
  return active?.id === undefined ? undefined : tabLinks[String(active.id)]
}

/** Folder ancestors of an item: collapsing one of these peeks instead. */
function folderPath(items: ItemsState, itemId?: ItemId): Set<ItemId> {
  const path = new Set<ItemId>()
  let cursor = itemId ? items.byId[itemId] : undefined
  const seen = new Set<ItemId>()
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id)
    if (cursor.data.kind === 'folder') path.add(cursor.id)
    cursor = cursor.parentId ? items.byId[cursor.parentId] : undefined
  }
  return path
}

/**
 * A pinned tab drifted when the tab linked to it left the canonical URL. The
 * link map is session state written by the background reconciler.
 */
function driftedPinnedIds(
  state: SidebarState,
  tabLinks: Record<string, string>,
  tabs: { id?: number; url?: string }[],
): Set<ItemId> {
  const drifted = new Set<ItemId>()
  const urlByTabId = new Map<number, string>()
  for (const tab of tabs) {
    if (tab.id !== undefined && tab.url) urlByTabId.set(tab.id, tab.url)
  }
  for (const [tabId, itemId] of Object.entries(tabLinks)) {
    const item = state.items.byId[itemId]
    if (item?.data.kind !== 'tab') continue
    const liveUrl = urlByTabId.get(Number(tabId))
    if (liveUrl && isDrifted(item.data.url, liveUrl)) drifted.add(itemId)
  }
  return drifted
}
