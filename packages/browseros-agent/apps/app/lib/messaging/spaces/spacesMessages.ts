import { defineExtensionMessaging } from '@webext-core/messaging'
import type { SpaceColor } from '@/lib/spaces/spaces.types'

/**
 * Tab-group work runs in the background so it survives the new tab page
 * navigating away mid-switch. UI surfaces only send intents and watch
 * storage for the result.
 */
export const SpacesMessageType = {
  /** Switch the whole browser to a space. */
  switch: 'spaces.switch',
  /** Move the active tab of the current window into a space and switch to it. */
  assignActiveTab: 'spaces.assignActiveTab',
  /** Group every ungrouped tab of the current window into a space. */
  adoptLooseTabs: 'spaces.adoptLooseTabs',
  /** Rename or recolor a space and every tab group that represents it. */
  update: 'spaces.update',
  /** Ungroup the space's tabs everywhere, then delete the space. */
  delete: 'spaces.delete',
  /** Background asks a mounted new tab page to open the switcher palette. */
  openSwitcher: 'spaces.openSwitcher',
} as const

export interface SpaceIdData {
  spaceId: string
}

export interface SpaceUpdateData extends SpaceIdData {
  name?: string
  emoji?: string
  color?: SpaceColor
}

type SpacesMessagesProtocol = {
  [SpacesMessageType.switch](data: SpaceIdData): void
  [SpacesMessageType.assignActiveTab](data: SpaceIdData): void
  [SpacesMessageType.adoptLooseTabs](data: SpaceIdData): void
  [SpacesMessageType.update](data: SpaceUpdateData): void
  [SpacesMessageType.delete](data: SpaceIdData): void
  [SpacesMessageType.openSwitcher](): boolean
}

const { sendMessage, onMessage } =
  defineExtensionMessaging<SpacesMessagesProtocol>()

export { onMessage as onSpacesMessage, sendMessage as sendSpacesMessage }
