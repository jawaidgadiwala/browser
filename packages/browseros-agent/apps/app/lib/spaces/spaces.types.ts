/**
 * Tab group colors Chromium accepts. Mirrors `chrome.tabGroups.ColorEnum`
 * as string literals so pure helpers and tests never touch `chrome.*`.
 *
 * @public
 */
export const SPACE_COLORS = [
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
] as const

/**
 * @public
 */
export type SpaceColor = (typeof SPACE_COLORS)[number]

/**
 * A Space is a named workspace. It does not own its tabs: membership lives
 * on the Chromium tab group that carries the space's name and color in each
 * window. Group ids are session-scoped, so nothing here references them.
 *
 * @public
 */
export interface Space {
  id: string
  name: string
  emoji: string
  color: SpaceColor
  createdAt: number
}

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
