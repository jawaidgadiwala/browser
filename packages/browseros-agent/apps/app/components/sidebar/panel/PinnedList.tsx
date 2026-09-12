import { ChevronDown, ChevronRight, Folder, RotateCcw } from 'lucide-react'
import { type FC, useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { TreeRow } from '@/lib/sidebar/core/selectors'
import type { Expansion, ItemId } from '@/lib/sidebar/core/types'
import { cn } from '@/lib/utils'
import { ROW_HEIGHT } from '@/modules/sidebar/sidebar-rows.helpers'
import { Favicon } from './Favicon'

export interface PinnedListProps {
  rows: TreeRow[]
  /** Pinned tabs whose live URL left the canonical one. */
  driftedIds: Set<ItemId>
  iconOnly?: boolean
  onOpen: (itemId: ItemId) => void
  onSetExpansion: (itemId: ItemId, expansion: Expansion) => void
  onReset: (itemId: ItemId) => void
  onUnpin: (itemId: ItemId) => void
}

export const PinnedList: FC<PinnedListProps> = ({
  rows,
  driftedIds,
  iconOnly,
  onOpen,
  onSetExpansion,
  onReset,
  onUnpin,
}) => {
  if (rows.length === 0) return null

  return (
    <div className="flex flex-col px-1">
      {rows.map((row) => (
        <PinnedRow
          key={row.item.id}
          row={row}
          drifted={driftedIds.has(row.item.id)}
          iconOnly={iconOnly}
          onOpen={onOpen}
          onSetExpansion={onSetExpansion}
          onReset={onReset}
          onUnpin={onUnpin}
        />
      ))}
    </div>
  )
}

type PinnedRowProps = Omit<PinnedListProps, 'rows' | 'driftedIds'> & {
  row: TreeRow
  drifted: boolean
}

const PinnedRow: FC<PinnedRowProps> = ({
  row,
  drifted,
  iconOnly,
  onOpen,
  onSetExpansion,
  onReset,
  onUnpin,
}) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const { item, depth } = row
  const isFolder = item.data.kind === 'folder'
  const title =
    item.title ?? (item.data.kind === 'tab' ? item.data.savedTitle : 'Folder')
  const url = item.data.kind === 'tab' ? item.data.url : ''

  return (
    <div className="relative">
      <div
        className={cn(
          'group flex items-center gap-2 rounded-md px-2 hover:bg-white/10',
          iconOnly && 'justify-center px-0',
        )}
        style={{
          height: ROW_HEIGHT,
          paddingLeft: iconOnly ? undefined : 8 + depth * 12,
        }}
      >
        <button
          type="button"
          title={title}
          onContextMenu={(event) => {
            event.preventDefault()
            setMenuOpen(true)
          }}
          onClick={() => {
            if (isFolder && item.data.kind === 'folder') {
              onSetExpansion(
                item.id,
                item.data.expansion === 'collapsed' ? 'expanded' : 'collapsed',
              )
              return
            }
            onOpen(item.id)
          }}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {isFolder ? (
            <>
              {item.data.kind === 'folder' &&
              item.data.expansion === 'collapsed' ? (
                <ChevronRight className="size-3.5 shrink-0 opacity-70" />
              ) : (
                <ChevronDown className="size-3.5 shrink-0 opacity-70" />
              )}
              <Folder className="size-4 shrink-0 opacity-70" />
            </>
          ) : (
            <Favicon url={url} />
          )}
          {!iconOnly && (
            <span className="min-w-0 flex-1 truncate text-xs">{title}</span>
          )}
        </button>
        {drifted && !iconOnly && (
          <button
            type="button"
            aria-label={`Reset ${title}`}
            title="Moved away from the pinned page"
            onClick={() => onReset(item.id)}
            className="flex shrink-0 items-center gap-1 rounded-sm bg-[var(--sb-accent)]/30 px-1 text-[10px]"
          >
            <RotateCcw className="size-3" />
            Reset
          </button>
        )}
      </div>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        {/* Zero-size anchor: the row itself must stay clickable, so only the
            context menu opens the dropdown. */}
        <DropdownMenuTrigger asChild>
          <span aria-hidden className="absolute bottom-0 left-4 block size-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {drifted && (
            <DropdownMenuItem onSelect={() => onReset(item.id)}>
              Reset to pinned page
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => onUnpin(item.id)}>
            {isFolder ? 'Remove folder' : 'Unpin'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
