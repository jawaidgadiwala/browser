import { Plus, X } from 'lucide-react'
import { type FC, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { nearestGroupColor } from '@/lib/sidebar/core/theme'
import type { Space, TabGroupColor, ThemeSpec } from '@/lib/sidebar/core/types'
import { cn } from '@/lib/utils'

export interface ThemePickerProps {
  space: Space
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Draft theme for the live panel preview; null clears it. */
  onPreview: (theme: ThemeSpec | null) => void
  onSave: (theme: ThemeSpec, color: TabGroupColor) => void
}

const MAX_KEY_COLORS = 3
const DEFAULT_KEY: [number, number, number] = [90, 110, 160]

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

function fromHex(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function primaryRgb(spec: ThemeSpec): [number, number, number] {
  const key = spec.keyColors.find((entry) => entry.primary) ?? spec.keyColors[0]
  return key?.rgb ?? DEFAULT_KEY
}

/**
 * Key colours, harmony, intensity and grain for one space. Every edit previews
 * on the live panel; Cancel drops the draft, Save also drags the space's tab
 * group to the nearest of Chromium's nine colours.
 */
export const ThemePicker: FC<ThemePickerProps> = ({
  space,
  open,
  onOpenChange,
  onPreview,
  onSave,
}) => {
  const [draft, setDraft] = useState<ThemeSpec>(space.theme)
  // Key colours have no identity of their own, so the rows carry one.
  const [rowIds, setRowIds] = useState<string[]>(() =>
    space.theme.keyColors.map((_, index) => `key-${index}`),
  )

  const update = (next: ThemeSpec, ids = rowIds) => {
    setDraft(next)
    setRowIds(ids)
    onPreview(next)
  }

  const close = (nextOpen: boolean) => {
    if (!nextOpen) onPreview(null)
    onOpenChange(nextOpen)
  }

  const keys =
    draft.keyColors.length > 0
      ? draft.keyColors
      : [{ rgb: DEFAULT_KEY, primary: true }]
  const ids = keys.map((_, index) => rowIds[index] ?? `key-${index}`)

  return (
    <Popover open={open} onOpenChange={close}>
      <PopoverTrigger asChild>
        <span aria-hidden className="block size-0" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        className="w-64 space-y-3 border-white/15 bg-[var(--sb-bg-toolbar)] text-[var(--sb-text)]"
      >
        <p className="font-medium text-xs">Theme · {space.name}</p>

        <div className="space-y-1">
          <p className="text-[11px] opacity-70">Key colors</p>
          <div className="flex items-center gap-2">
            {keys.map((key, index) => (
              <div key={ids[index]} className="relative">
                <input
                  type="color"
                  aria-label={`Key color ${index + 1}`}
                  value={toHex(key.rgb)}
                  onChange={(event) =>
                    update({
                      ...draft,
                      keyColors: keys.map((entry, position) =>
                        position === index
                          ? { ...entry, rgb: fromHex(event.target.value) }
                          : entry,
                      ),
                    })
                  }
                  className="size-8 cursor-pointer rounded-md border border-white/20 bg-transparent"
                />
                {keys.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remove key color ${index + 1}`}
                    onClick={() =>
                      update(
                        {
                          ...draft,
                          keyColors: keys
                            .filter((_, position) => position !== index)
                            .map((entry, position) => ({
                              ...entry,
                              primary: position === 0,
                            })),
                        },
                        ids.filter((_, position) => position !== index),
                      )
                    }
                    className="absolute -top-1.5 -right-1.5 rounded-full bg-black/60 p-0.5"
                  >
                    <X className="size-2.5" />
                  </button>
                )}
              </div>
            ))}
            {keys.length < MAX_KEY_COLORS && (
              <button
                type="button"
                aria-label="Add key color"
                onClick={() =>
                  update(
                    { ...draft, keyColors: [...keys, { rgb: DEFAULT_KEY }] },
                    [...ids, `key-${Date.now()}`],
                  )
                }
                className="flex size-8 items-center justify-center rounded-md border border-white/20 border-dashed opacity-70 hover:opacity-100"
              >
                <Plus className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-[11px] opacity-70">Wheel</p>
          <div className="flex gap-1">
            {(['analogous', 'complementary'] as const).map((wheel) => (
              <button
                key={wheel}
                type="button"
                aria-pressed={draft.wheel === wheel}
                onClick={() => update({ ...draft, wheel })}
                className={cn(
                  'flex-1 rounded-md border border-white/15 px-2 py-1 text-[11px] capitalize',
                  draft.wheel === wheel ? 'bg-white/20' : 'opacity-70',
                )}
              >
                {wheel}
              </button>
            ))}
          </div>
        </div>

        <ThemeSlider
          label="Intensity"
          value={draft.intensity}
          onChange={(intensity) => update({ ...draft, intensity })}
        />
        <ThemeSlider
          label="Noise"
          value={draft.noise}
          onChange={(noise) => update({ ...draft, noise })}
        />

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              const spec = { ...draft, keyColors: keys }
              onSave(spec, nearestGroupColor(primaryRgb(spec)))
              onPreview(null)
              onOpenChange(false)
            }}
          >
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

const ThemeSlider: FC<{
  label: string
  value: number
  onChange: (value: number) => void
}> = ({ label, value, onChange }) => (
  <label className="block space-y-1">
    <span className="text-[11px] opacity-70">
      {label} · {Math.round(value * 100)}%
    </span>
    <input
      type="range"
      min={0}
      max={1}
      step={0.01}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="w-full accent-[var(--sb-accent)]"
    />
  </label>
)
