import { z } from 'zod/v3'
import type { SidebarSettings } from '@/lib/sidebar/core/types'

/** The editable slice of `SidebarSettings`, with the spec's bounds. */
export const sidebarSettingsSchema = z.object({
  autoArchiveAfter: z.enum(['1h', '6h', '12h', '24h', '7d', '30d', 'never']),
  discardInactiveSpacesAfterMin: z.coerce.number().int().min(1).max(1440),
  essentialsMax: z.coerce.number().int().min(3).max(24),
  pinnedCloseBehavior: z.enum([
    'reset-unload-switch',
    'reset',
    'unload-switch',
    'close',
  ]),
  naturalScroll: z.boolean(),
})

/**
 * @public
 */
export type SidebarSettingsValues = z.infer<typeof sidebarSettingsSchema>

export const AUTO_ARCHIVE_OPTIONS: Array<{
  value: SidebarSettings['autoArchiveAfter']
  label: string
}> = [
  { value: '1h', label: 'After 1 hour' },
  { value: '6h', label: 'After 6 hours' },
  { value: '12h', label: 'After 12 hours' },
  { value: '24h', label: 'After 24 hours' },
  { value: '7d', label: 'After 7 days' },
  { value: '30d', label: 'After 30 days' },
  { value: 'never', label: 'Never' },
]

export const PINNED_CLOSE_OPTIONS: Array<{
  value: SidebarSettings['pinnedCloseBehavior']
  label: string
}> = [
  { value: 'reset-unload-switch', label: 'Reset, unload, select another tab' },
  { value: 'reset', label: 'Reset to the pinned URL' },
  { value: 'unload-switch', label: 'Unload and select another tab' },
  { value: 'close', label: 'Close the tab' },
]

/** Raw control input; numbers arrive as strings and are coerced. */
export type SidebarSettingsPatch = {
  [K in keyof SidebarSettingsValues]?: SidebarSettingsValues[K] | string
}

/**
 * @public
 */
export type SettingsPatchResult =
  | { ok: true; value: Partial<SidebarSettings> }
  | { ok: false; message: string }

/** Validates one changed field before it reaches the background writer. */
export function validatePatch(
  patch: SidebarSettingsPatch,
): SettingsPatchResult {
  const keys = Object.keys(patch) as Array<keyof SidebarSettingsValues>
  const result = sidebarSettingsSchema
    .pick(
      Object.fromEntries(keys.map((key) => [key, true])) as {
        [K in keyof SidebarSettingsValues]?: true
      },
    )
    .safeParse(patch)
  if (!result.success) {
    return {
      ok: false,
      message: result.error.issues[0]?.message ?? 'Invalid value',
    }
  }
  return { ok: true, value: result.data }
}
