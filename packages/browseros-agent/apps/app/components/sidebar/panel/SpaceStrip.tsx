import type { FC } from 'react'
import { isDrifted, pinnedTree } from '@/lib/sidebar/core/selectors'
import type {
  ItemId,
  ItemsState,
  SidebarState,
  Space,
} from '@/lib/sidebar/core/types'
import { sidebarActions } from '@/modules/sidebar/sidebar-actions'
import {
  groupIdForSpace,
  type LiveGroup,
  type LiveTab,
  pinnedUrls,
  type TabRowData,
  todayRows,
} from '@/modules/sidebar/sidebar-rows.helpers'
import { PinnedList } from './PinnedList'
import { Separator } from './Separator'
import { SpaceHeader } from './SpaceHeader'
import { TodayList } from './TodayList'

const NEW_FOLDER_TITLE = 'New folder'

export interface SpaceStripProps {
  space: Space
  state: SidebarState
  live: { windowId: number; tabs: LiveTab[]; groups: LiveGroup[] }
  tabLinks: Record<string, string>
  iconOnly: boolean
  /** Search results replace the today rows on the active strip only. */
  rows?: TabRowData[]
  emptyLabel?: string
  onOpenTheme: () => void
}

/**
 * One space's column: header, pinned tree, separator, today rows. Neighbour
 * strips render the same composition from their own group's live tabs; the
 * carousel makes them inert, so their handlers never fire.
 */
export const SpaceStrip: FC<SpaceStripProps> = ({
  space,
  state,
  live,
  tabLinks,
  iconOnly,
  rows,
  emptyLabel,
  onOpenTheme,
}) => {
  const groupId = groupIdForSpace(live.groups, space, live.windowId)
  const pinned = pinnedUrls(state.items, space)
  const activeItemId = activeLinkedItemId(tabLinks, live.tabs)
  const visibleRows = rows ?? todayRows(live.tabs, groupId, pinned)

  return (
    <>
      <SpaceHeader
        space={space}
        iconOnly={iconOnly}
        onToggleCollapsed={() =>
          sidebarActions.updateSpace({
            spaceId: space.id,
            pinnedCollapsed: !space.pinnedCollapsed,
          })
        }
        onRename={(name) =>
          sidebarActions.updateSpace({ spaceId: space.id, name })
        }
        onAssignActiveTab={() => sidebarActions.assignActiveTab(space.id)}
        onAdoptLooseTabs={() => sidebarActions.adoptLooseTabs(space.id)}
        onNewFolder={() =>
          sidebarActions.createFolder(space.id, NEW_FOLDER_TITLE)
        }
        onOpenTheme={onOpenTheme}
      />
      {!space.pinnedCollapsed && (
        <PinnedList
          rows={pinnedTree(state, space.id, activeItemId)}
          items={state.items}
          pinnedRootId={space.containers.pinned}
          driftedIds={driftedPinnedIds(state, tabLinks, live.tabs)}
          activeFolderIds={folderPath(state.items, activeItemId)}
          activeItemId={activeItemId}
          iconOnly={iconOnly}
          onOpen={(itemId) => sidebarActions.openItem(itemId)}
          onSetExpansion={(itemId, expansion) =>
            sidebarActions.setExpansion(itemId, expansion)
          }
          onReset={(itemId) => sidebarActions.resetPinned(itemId)}
          onUnpin={(itemId) => sidebarActions.unpinItem(itemId)}
          onRename={(itemId, title) => sidebarActions.renameItem(itemId, title)}
          onAddEssential={(url, title) =>
            sidebarActions.addEssential({ url, title })
          }
          onNewFolder={(parentId) =>
            sidebarActions.createFolder(space.id, NEW_FOLDER_TITLE, parentId)
          }
          onClosePinned={(itemId) => closePinned(tabLinks, itemId)}
        />
      )}
      <Separator
        iconOnly={iconOnly}
        onNewTab={() => sidebarActions.newTab(space.id)}
        onTidy={() => sidebarActions.tidy(space.id)}
        onClear={() => sidebarActions.clear(space.id)}
      />
      <TodayList
        rows={visibleRows}
        dropId={`today:${space.id}`}
        iconOnly={iconOnly}
        emptyLabel={emptyLabel ?? 'No tabs in this space yet'}
        onActivate={(tabId) => sidebarActions.activateTab(tabId)}
        onClose={(tabId) =>
          sidebarActions.closeTabs([tabId], 'sidebar-row-close')
        }
        onPin={(tabId) => sidebarActions.pinTab({ tabId })}
        onAddEssential={(tabId) => sidebarActions.addEssential({ tabId })}
      />
    </>
  )
}

function closePinned(tabLinks: Record<string, string>, itemId: ItemId): void {
  const entry = Object.entries(tabLinks).find(([, id]) => id === itemId)
  if (!entry) return
  sidebarActions.closeTabs([Number(entry[0])], 'sidebar-pinned-close')
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
