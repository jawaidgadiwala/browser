import { ArrowDown, ArrowUp, Layers, Pencil, Trash2 } from 'lucide-react'
import { type FC, useState } from 'react'
import { SpaceDialog } from '@/components/spaces/SpaceDialog'
import { SPACE_COLOR_HEX } from '@/components/spaces/space-colors'
import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { nextColor, spaceGlyph } from '@/lib/spaces/spaces.helpers'
import type { Space, SpacesSettings } from '@/lib/spaces/spaces.types'
import { useIsMac } from '@/lib/useIsMac'
import { useSpaces } from '@/modules/spaces/spaces.hooks'

const SETTING_ROWS: Array<{
  key: keyof SpacesSettings
  label: string
  description: string
}> = [
  {
    key: 'adoptNewTabs',
    label: 'New tabs join the active space',
    description:
      'Tabs you open are grouped into the current space automatically.',
  },
  {
    key: 'followActiveTab',
    label: 'Follow the active tab',
    description:
      'Clicking a tab that belongs to another space switches to that space.',
  },
  {
    key: 'wrapAround',
    label: 'Wrap around',
    description: 'Next after the last space returns to the first.',
  },
]

export const SpacesSettingsPage: FC = () => {
  const api = useSpaces()
  const { spaces, activeSpaceId, settings } = api
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Space | undefined>()
  const isMac = useIsMac()
  const alt = isMac ? '⌥' : 'Alt'

  return (
    <div className="fade-in slide-in-from-bottom-5 animate-in space-y-6 duration-500">
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-orange)]/10">
            <Layers className="h-6 w-6 text-[var(--accent-orange)]" />
          </div>
          <div className="flex-1">
            <h2 className="mb-1 font-semibold text-xl">Spaces</h2>
            <p className="text-muted-foreground text-sm">
              Arc-style workspaces built on tab groups. Each space is a colored
              group in the sidebar; switching expands it and collapses the rest.
            </p>
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">Your spaces</h3>
          <Button size="sm" onClick={() => setCreating(true)}>
            New space
          </Button>
        </div>
        {spaces.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No spaces yet. Create one to start grouping tabs.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {spaces.map((space, index) => (
              <li
                key={space.id}
                className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <span
                  className="flex size-7 items-center justify-center rounded-full text-white text-xs"
                  style={{ backgroundColor: SPACE_COLOR_HEX[space.color] }}
                >
                  {spaceGlyph(space)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-sm">
                    {space.name}
                    {space.id === activeSpaceId && (
                      <span className="ml-2 text-muted-foreground text-xs">
                        current
                      </span>
                    )}
                  </div>
                  {index < 9 && (
                    <div className="text-muted-foreground text-xs">
                      Shortcut slot {index + 1}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Move up"
                  disabled={index === 0}
                  onClick={() => api.move(space.id, -1)}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Move down"
                  disabled={index === spaces.length - 1}
                  onClick={() => api.move(space.id, 1)}
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Edit"
                  onClick={() => setEditing(space)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete"
                  onClick={() => api.remove(space.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h3 className="mb-4 font-semibold">Behavior</h3>
        <div className="space-y-5">
          {SETTING_ROWS.map((row) => (
            <div
              key={row.key}
              className="flex items-start justify-between gap-6"
            >
              <div>
                <Label htmlFor={`spaces-${row.key}`}>{row.label}</Label>
                <p className="mt-1 text-muted-foreground text-sm">
                  {row.description}
                </p>
              </div>
              <Switch
                id={`spaces-${row.key}`}
                checked={settings[row.key]}
                onCheckedChange={(checked) =>
                  api.setSettings({ [row.key]: checked })
                }
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h3 className="mb-4 font-semibold">Shortcuts</h3>
        <dl className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <dt>Next space</dt>
            <dd>
              <KbdGroup>
                <Kbd>{alt}</Kbd>
                <Kbd>⇧</Kbd>
                <Kbd>→</Kbd>
              </KbdGroup>
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt>Previous space</dt>
            <dd>
              <KbdGroup>
                <Kbd>{alt}</Kbd>
                <Kbd>⇧</Kbd>
                <Kbd>←</Kbd>
              </KbdGroup>
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt>Space switcher</dt>
            <dd>
              <KbdGroup>
                <Kbd>{alt}</Kbd>
                <Kbd>⇧</Kbd>
                <Kbd>S</Kbd>
              </KbdGroup>
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-muted-foreground text-xs">
          Direct jumps to spaces 1 to 9 have no default key. Assign them at{' '}
          <code>chrome://extensions/shortcuts</code>.
        </p>
      </section>

      <SpaceDialog
        open={creating}
        onOpenChange={setCreating}
        spaces={spaces}
        defaultColor={nextColor(spaces)}
        onSubmit={async (values) => {
          await api.create(values, false)
        }}
      />
      <SpaceDialog
        open={editing !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined)
        }}
        space={editing}
        spaces={spaces}
        defaultColor={editing?.color ?? nextColor(spaces)}
        onSubmit={async (values) => {
          if (editing) await api.update(editing.id, values)
        }}
      />
    </div>
  )
}
