import {
  type Space as SidebarSpace,
  TAB_GROUP_COLORS,
  type TabGroupColor,
} from '@/lib/sidebar/core/types'

/**
 * The Spaces surface is a view over the sidebar model: one type, one store.
 * These aliases keep the existing call sites readable.
 *
 * @public
 */
export const SPACE_COLORS = TAB_GROUP_COLORS

/**
 * @public
 */
export type SpaceColor = TabGroupColor

/**
 * A Space is a named workspace. It does not own its tabs: membership lives
 * on the Chromium tab group that carries the space's name and color in each
 * window. Group ids are session-scoped, so nothing here references them.
 *
 * @public
 */
export type Space = SidebarSpace

/**
 * @public
 */
export interface SpacesSettings {
  /** New tabs are grouped into the active space. */
  adoptNewTabs: boolean
  /** Activating a tab that belongs to another space switches to that space. */
  followActiveTab: boolean
  /** Next/previous wrap around at the ends. */
  wrapAround: boolean
}

export const DEFAULT_SPACES_SETTINGS: SpacesSettings = {
  adoptNewTabs: true,
  followActiveTab: true,
  wrapAround: true,
}
