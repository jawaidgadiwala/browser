import type { SpaceColor } from '@/lib/spaces/spaces.types'

/** Approximations of Chromium's tab group palette, for pills and dots. */
export const SPACE_COLOR_HEX: Record<SpaceColor, string> = {
  grey: '#8e9196',
  blue: '#3b82f6',
  red: '#ef4444',
  yellow: '#eab308',
  green: '#22c55e',
  pink: '#ec4899',
  purple: '#a855f7',
  cyan: '#06b6d4',
  orange: '#f97316',
}

export const SPACE_COLOR_LABEL: Record<SpaceColor, string> = {
  grey: 'Grey',
  blue: 'Blue',
  red: 'Red',
  yellow: 'Yellow',
  green: 'Green',
  pink: 'Pink',
  purple: 'Purple',
  cyan: 'Cyan',
  orange: 'Orange',
}
