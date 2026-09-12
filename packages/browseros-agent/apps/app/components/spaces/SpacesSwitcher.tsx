import { Plus } from 'lucide-react'
import { type FC, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command'
import {
  onSidebarMessage,
  SidebarMessageType,
} from '@/lib/messaging/sidebar/sidebarMessages'
import { nextColor, spaceGlyph } from '@/lib/spaces/spaces.helpers'
import { useSpaces } from '@/modules/spaces/spaces.hooks'
import { SpaceDialog } from './SpaceDialog'
import { SPACE_COLOR_HEX } from './space-colors'

const OPEN_PARAM = 'spaces'

/**
 * Command palette for jumping between spaces. Opens from the global
 * shortcut (the background messages a mounted new tab, or opens one with
 * `?spaces=1`), or from Alt+Shift+S while the new tab is focused.
 */
export const SpacesSwitcher: FC = () => {
  const api = useSpaces()
  const { spaces, activeSpaceId } = api
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    if (searchParams.get(OPEN_PARAM) !== '1') return
    setOpen(true)
    const next = new URLSearchParams(searchParams)
    next.delete(OPEN_PARAM)
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    const unsubscribe = onSidebarMessage(
      SidebarMessageType.openSwitcher,
      () => {
        setOpen(true)
        return true
      },
    )
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && event.code === 'KeyS') {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      unsubscribe()
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Switch space"
        description="Jump to a space or create one"
      >
        <CommandInput placeholder="Switch to space…" />
        <CommandList>
          <CommandEmpty>No matching space.</CommandEmpty>
          <CommandGroup heading="Spaces">
            {spaces.map((space, index) => (
              <CommandItem
                key={space.id}
                value={`${space.name} ${space.icon}`}
                onSelect={() => {
                  setOpen(false)
                  void api.switchTo(space.id)
                }}
              >
                <span
                  className="flex size-5 items-center justify-center rounded-full text-[11px] text-white leading-none"
                  style={{ backgroundColor: SPACE_COLOR_HEX[space.color] }}
                >
                  {spaceGlyph(space)}
                </span>
                <span className="flex-1 truncate">{space.name}</span>
                {space.id === activeSpaceId && (
                  <span className="text-muted-foreground text-xs">current</span>
                )}
                {index < 9 && <CommandShortcut>{index + 1}</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Actions">
            <CommandItem
              value="new space create"
              onSelect={() => {
                setOpen(false)
                setCreating(true)
              }}
            >
              <Plus />
              New space
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      <SpaceDialog
        open={creating}
        onOpenChange={setCreating}
        spaces={spaces}
        defaultColor={nextColor(spaces)}
        onSubmit={async (values) => {
          await api.create(values)
        }}
      />
    </>
  )
}
