import { type FC, useState } from 'react'
import { useNavigate } from 'react-router'
import { SidebarDndContext } from '@/components/sidebar/dnd/SidebarDndContext'
import { EssentialsGrid } from '@/components/sidebar/panel/EssentialsGrid'
import { FooterBar } from '@/components/sidebar/panel/FooterBar'
import { SearchBox } from '@/components/sidebar/panel/SearchBox'
import { SidebarRoot } from '@/components/sidebar/panel/SidebarRoot'
import { SpaceCarousel } from '@/components/sidebar/panel/SpaceCarousel'
import { SpaceStrip } from '@/components/sidebar/panel/SpaceStrip'
import { ThemePicker } from '@/components/sidebar/panel/ThemePicker'
import type { SpaceDialogValues } from '@/components/spaces/SpaceDialog'
import { adjacentSpace, essentialsList } from '@/lib/sidebar/core/selectors'
import { themeSpecForColor } from '@/lib/sidebar/core/theme'
import type {
  SidebarState,
  Space,
  SpaceId,
  TabGroupColor,
  ThemeSpec,
} from '@/lib/sidebar/core/types'
import { useLiveTabs } from '@/modules/sidebar/live-tabs.hooks'
import { setPanelMode } from '@/modules/sidebar/panel-mode'
import { openUrlInTab, sidebarActions } from '@/modules/sidebar/sidebar-actions'
import { useElementWidth } from '@/modules/sidebar/sidebar-layout.hooks'
import { isIconOnly, searchRows } from '@/modules/sidebar/sidebar-rows.helpers'
import { useSidebarState } from '@/modules/sidebar/sidebar-state.hooks'
import { useSwipe } from '@/modules/sidebar/swipe.hooks'
import { skinOf, useThemeFade } from '@/modules/sidebar/theme.hooks'

const SETTINGS_URL = '/app.html#/settings/spaces'
const DOWNLOADS_URL = 'chrome://downloads'

function specOf(space: Space | undefined): ThemeSpec {
  return space?.theme ?? themeSpecForColor(space?.color ?? 'grey')
}

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
  const [themeSpaceId, setThemeSpaceId] = useState<SpaceId | null>(null)
  const [draftTheme, setDraftTheme] = useState<ThemeSpec | null>(null)
  const { ref, width } = useElementWidth<HTMLDivElement>()
  const iconOnly = isIconOnly(width)

  const swipe = useSwipe(ref, {
    order: spaces.order,
    activeSpaceId,
    width,
    wrap: settings.wrapAround,
    naturalScroll: settings.naturalScroll,
    onSwitch: (spaceId) => sidebarActions.switchSpace(spaceId),
  })
  const swipeTargetId = swipe.direction
    ? adjacentSpace(
        spaces.order,
        activeSpaceId,
        swipe.direction,
        settings.wrapAround,
      )
    : null
  const swipeTarget =
    swipeTargetId && swipeTargetId !== activeSpaceId
      ? spaces.byId[swipeTargetId]
      : undefined

  const activeSpec =
    draftTheme && themeSpaceId === activeSpaceId
      ? draftTheme
      : specOf(activeSpace)
  const layers = useThemeFade(
    ref,
    skinOf(activeSpec),
    swipeTarget ? skinOf(specOf(swipeTarget)) : null,
  )

  const state: SidebarState = {
    spaces,
    activeSpaceId,
    items,
    archive: [],
    settings,
  }

  const results = searchRows(
    live.tabs,
    live.groups,
    spaceList,
    activeSpaceId,
    query,
    live.windowId,
  )

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

  const reorderSpace = async (spaceId: SpaceId, index: number) => {
    const from = spaces.order.indexOf(spaceId)
    if (from === -1 || from === index) return
    const direction = index > from ? 1 : -1
    for (let step = 0; step < Math.abs(index - from); step += 1) {
      await sidebarActions.moveSpace(spaceId, direction)
    }
  }

  const saveTheme = (spaceId: SpaceId) => {
    return (nextTheme: ThemeSpec, color: TabGroupColor) => {
      sidebarActions.updateSpace({ spaceId, theme: nextTheme, color })
      setThemeSpaceId(null)
    }
  }

  const themeSpace = themeSpaceId ? spaces.byId[themeSpaceId] : undefined

  return (
    <SidebarRoot
      ref={ref}
      theme={layers.base.theme}
      overlayTheme={layers.overlay.theme}
      baseGradient={layers.base.gradient}
      overlayGradient={layers.overlay.gradient}
      noise={layers.overlay.noise}
      onNextSpace={() => switchTo(1)}
      onPrevSpace={() => switchTo(-1)}
      onToggleMode={openChat}
    >
      {/* The root stays mounted before the store loads: the swipe and width
          observers bind to this element once, on mount. */}
      {ready && (
        <SidebarDndContext onEdgeHold={switchTo}>
          <SearchBox
            value={query}
            onChange={setQuery}
            iconOnly={iconOnly}
            onSubmit={() => {
              const first = results[0]
              if (first) sidebarActions.activateTab(first.tabId)
            }}
          />
          <EssentialsGrid
            rootId={items.roots.essentials}
            items={essentialsList(state)}
            iconOnly={iconOnly}
            onOpen={(itemId) => sidebarActions.openItem(itemId)}
            onRemove={(itemId) => sidebarActions.removeEssential(itemId)}
          />
          {activeSpace ? (
            <SpaceCarousel
              order={spaces.order}
              activeSpaceId={activeSpaceId}
              wrap={settings.wrapAround}
              renderStrip={(spaceId, active) => {
                const space = spaces.byId[spaceId]
                if (!space) return null
                return (
                  <SpaceStrip
                    space={space}
                    state={state}
                    live={live}
                    tabLinks={tabLinks}
                    iconOnly={iconOnly}
                    rows={active && query.trim() ? results : undefined}
                    emptyLabel={
                      active && query.trim() ? 'No tabs match' : undefined
                    }
                    onOpenTheme={() => setThemeSpaceId(spaceId)}
                  />
                )
              }}
            />
          ) : (
            <p className="px-3 py-4 text-xs opacity-70">
              No space yet. Use + below to create one.
            </p>
          )}
        </SidebarDndContext>
      )}
      {ready && (
        <>
          <FooterBar
            spaces={spaceList}
            activeSpaceId={activeSpaceId}
            swipeTargetId={swipeTargetId}
            onSwitch={(spaceId: SpaceId) => sidebarActions.switchSpace(spaceId)}
            onRenameSpace={(spaceId, name) =>
              sidebarActions.updateSpace({ spaceId, name })
            }
            onOpenTheme={setThemeSpaceId}
            onDeleteSpace={(spaceId) => sidebarActions.deleteSpace(spaceId)}
            onReorderSpace={reorderSpace}
            onCreate={createSpace}
            onOpenSettings={() =>
              openUrlInTab(chrome.runtime.getURL(SETTINGS_URL))
            }
            onOpenDownloads={() => openUrlInTab(DOWNLOADS_URL)}
            onOpenChat={openChat}
          />
          {themeSpace && (
            <ThemePicker
              key={themeSpace.id}
              space={themeSpace}
              open
              onOpenChange={(open) => {
                if (!open) setThemeSpaceId(null)
              }}
              onPreview={setDraftTheme}
              onSave={saveTheme(themeSpace.id)}
            />
          )}
        </>
      )}
    </SidebarRoot>
  )
}
