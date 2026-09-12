import { ChevronDown, ChevronRight } from 'lucide-react'
import { type FC, useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Space } from '@/lib/sidebar/core/types'
import { cn } from '@/lib/utils'

export interface SpaceHeaderProps {
  space: Space
  iconOnly?: boolean
  onToggleCollapsed: () => void
  onRename: (name: string) => void
  onAssignActiveTab: () => void
  onAdoptLooseTabs: () => void
}

export const SpaceHeader: FC<SpaceHeaderProps> = ({
  space,
  iconOnly,
  onToggleCollapsed,
  onRename,
  onAssignActiveTab,
  onAdoptLooseTabs,
}) => {
  const [draft, setDraft] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const commit = () => {
    const next = (draft ?? '').trim()
    if (next && next !== space.name) onRename(next)
    setDraft(null)
  }

  if (draft !== null && !iconOnly) {
    return (
      <div className="flex h-9 items-center px-2">
        <input
          // biome-ignore lint/a11y/noAutofocus: the inline rename replaces the label in place
          autoFocus
          aria-label="Rename space"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit()
            if (event.key === 'Escape') setDraft(null)
          }}
          className="h-7 min-w-0 flex-1 rounded-md border border-[var(--sb-accent)] bg-[var(--sb-bg-toolbar)] px-2 text-[var(--sb-text)] text-sm outline-none"
        />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'relative flex h-9 items-center gap-2 px-2',
        iconOnly && 'justify-center px-0',
      )}
    >
      <button
        type="button"
        aria-label={`Toggle pinned tabs for ${space.name}`}
        onClick={onToggleCollapsed}
        onDoubleClick={() => setDraft(space.name)}
        onContextMenu={(event) => {
          event.preventDefault()
          setMenuOpen(true)
        }}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-white/10"
      >
        <span aria-hidden className="text-base leading-none">
          {space.icon || '⬤'}
        </span>
        {!iconOnly && (
          <span className="min-w-0 flex-1 truncate font-medium text-sm">
            {space.name}
          </span>
        )}
        {!iconOnly &&
          (space.pinnedCollapsed ? (
            <ChevronRight className="size-3.5 shrink-0 opacity-60" />
          ) : (
            <ChevronDown className="size-3.5 shrink-0 opacity-60" />
          ))}
      </button>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        {/* Zero-size anchor: the header itself toggles the pinned list, so
            only the context menu opens the dropdown. */}
        <DropdownMenuTrigger asChild>
          <span aria-hidden className="absolute bottom-0 left-4 block size-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={onAssignActiveTab}>
            Move current tab here
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onAdoptLooseTabs}>
            Adopt ungrouped tabs
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDraft(space.name)}>
            Rename
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
