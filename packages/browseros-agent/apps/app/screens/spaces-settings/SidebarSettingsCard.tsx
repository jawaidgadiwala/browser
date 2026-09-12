import { type FC, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { DEFAULTS, type SidebarSettings } from '@/lib/sidebar/core/types'
import { sidebarSettingsStorage } from '@/lib/sidebar/storage'
import { archiveActions } from '@/modules/sidebar/archive.actions'
import {
  AUTO_ARCHIVE_OPTIONS,
  PINNED_CLOSE_OPTIONS,
  type SidebarSettingsPatch,
  validatePatch,
} from './sidebar-settings.helpers'

/**
 * Sidebar behavior. Every control saves immediately through the background,
 * which stays the single writer of the sidebar document.
 */
export const SidebarSettingsCard: FC = () => {
  const [settings, setSettings] = useState<SidebarSettings>(DEFAULTS)

  useEffect(() => {
    let cancelled = false
    sidebarSettingsStorage.getValue().then((next) => {
      if (!cancelled) setSettings({ ...DEFAULTS, ...next })
    })
    const unwatch = sidebarSettingsStorage.watch((next) =>
      setSettings({ ...DEFAULTS, ...(next ?? {}) }),
    )
    return () => {
      cancelled = true
      unwatch()
    }
  }, [])

  const save = (patch: SidebarSettingsPatch) => {
    if (Object.values(patch).some((value) => value === '')) return
    const result = validatePatch(patch)
    if (!result.ok) {
      toast.error(result.message)
      return
    }
    setSettings((current) => ({ ...current, ...result.value }))
    void archiveActions.updateSettings(result.value)
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h3 className="mb-1 font-semibold">Sidebar</h3>
      <p className="mb-5 text-muted-foreground text-sm">
        Archive timing, memory discipline, and pinned tab behavior for the side
        panel sidebar.
      </p>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-6">
          <div>
            <Label htmlFor="sidebar-auto-archive">Archive today tabs</Label>
            <p className="mt-1 text-muted-foreground text-sm">
              Untouched tabs are archived and closed after this long.
            </p>
          </div>
          <Select
            value={settings.autoArchiveAfter}
            onValueChange={(value) =>
              save({
                autoArchiveAfter: value as SidebarSettings['autoArchiveAfter'],
              })
            }
          >
            <SelectTrigger id="sidebar-auto-archive" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUTO_ARCHIVE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-start justify-between gap-6">
          <div>
            <Label htmlFor="sidebar-discard">Discard inactive spaces</Label>
            <p className="mt-1 text-muted-foreground text-sm">
              Minutes before tabs of a space you left are unloaded.
            </p>
          </div>
          <Input
            id="sidebar-discard"
            type="number"
            min={1}
            max={1440}
            className="w-24"
            value={settings.discardInactiveSpacesAfterMin}
            onChange={(event) =>
              save({ discardInactiveSpacesAfterMin: event.target.value })
            }
          />
        </div>

        <div className="flex items-start justify-between gap-6">
          <div>
            <Label htmlFor="sidebar-essentials-max">Essentials</Label>
            <p className="mt-1 text-muted-foreground text-sm">
              How many sites fit in the essentials grid (3 to 24).
            </p>
          </div>
          <Input
            id="sidebar-essentials-max"
            type="number"
            min={3}
            max={24}
            className="w-24"
            value={settings.essentialsMax}
            onChange={(event) => save({ essentialsMax: event.target.value })}
          />
        </div>

        <div className="flex items-start justify-between gap-6">
          <div>
            <Label htmlFor="sidebar-pinned-close">Closing a pinned tab</Label>
            <p className="mt-1 text-muted-foreground text-sm">
              Pinned rows never disappear; this picks what closing does.
            </p>
          </div>
          <Select
            value={settings.pinnedCloseBehavior}
            onValueChange={(value) =>
              save({
                pinnedCloseBehavior:
                  value as SidebarSettings['pinnedCloseBehavior'],
              })
            }
          >
            <SelectTrigger id="sidebar-pinned-close" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PINNED_CLOSE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-start justify-between gap-6">
          <div>
            <Label htmlFor="sidebar-natural-scroll">Natural scroll</Label>
            <p className="mt-1 text-muted-foreground text-sm">
              Invert the direction a two-finger swipe moves between spaces.
            </p>
          </div>
          <Switch
            id="sidebar-natural-scroll"
            checked={settings.naturalScroll}
            onCheckedChange={(checked) => save({ naturalScroll: checked })}
          />
        </div>
      </div>
    </section>
  )
}
