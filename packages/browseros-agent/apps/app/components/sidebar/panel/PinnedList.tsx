import { useDroppable } from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronRight, Folder, RotateCcw } from 'lucide-react'
import { type FC, useState } from 'react'
import type { SidebarDndData } from '@/components/sidebar/dnd/SidebarDndContext'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { TreeRow } from '@/lib/sidebar/core/selectors'
import type {
  Expansion,
  Item,
  ItemId,
  ItemsState,
} from '@/lib/sidebar/core/types'
import { cn } from '@/lib/utils'
import { useWindowedRows } from '@/modules/sidebar/sidebar-layout.hooks'
import { ROW_HEIGHT } from '@/modules/sidebar/sidebar-rows.helpers'
import { Favicon } from './Favicon'

export interface PinnedListProps {
  rows: TreeRow[]
  items: ItemsState
  pinnedRootId: ItemId
  /** Pinned tabs whose live URL left the canonical one. */
  driftedIds: Set<ItemId>
  /** Folders on the path to the active tab; collapsing one peeks instead. */
  activeFolderIds: Set<ItemId>
  activeItemId?: ItemId
  iconOnly?: boolean
  onOpen: (itemId: ItemId) => void
  onSetExpansion: (itemId: ItemId, expansion: Expansion) => void
  onReset: (itemId: ItemId) => void
  onUnpin: (itemId: ItemId) => void
  onRename: (itemId: ItemId, title: string) => void
  onAddEssential: (url: string, title: string) => void
  onNewFolder: (parentId: ItemId) => void
  onClosePinned: (itemId: ItemId) => void
}

function indexInParent(items: ItemsState, item: Item): number {
  const parent = item.parentId ? items.byId[item.parentId] : undefined
  const at = parent?.children.indexOf(item.id) ?? -1
  return at < 0 ? 0 : at
}

export const PinnedList: FC<PinnedListProps> = ({ rows, ...rest }) => {
  const { ref, range, totalHeight, offsetTop } =
    useWindowedRows<HTMLDivElement>(rows.length, ROW_HEIGHT)
  const { setNodeRef, isOver } = useDroppable({
    id: `pinned:${rest.pinnedRootId}`,
    data: {
      target: {
        zone: 'pinned',
        parentId: rest.pinnedRootId,
        index: Number.MAX_SAFE_INTEGER,
      },
    } satisfies SidebarDndData,
  })

  return (
    <div
      ref={(node) => {
        ref.current = node
        setNodeRef(node)
      }}
      data-pinned-list
      className={cn(
        'flex max-h-[45%] shrink-0 flex-col overflow-y-auto px-1',
        isOver && 'bg-white/5',
      )}
    >
      <SortableContext
        items={rows.map((row) => row.item.id)}
        strategy={verticalListSortingStrategy}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ transform: `translateY(${offsetTop}px)` }}>
            {rows.slice(range.start, range.end).map((row) => (
              <PinnedRow key={row.item.id} row={row} {...rest} />
            ))}
          </div>
        </div>
      </SortableContext>
    </div>
  )
}

type PinnedRowProps = Omit<PinnedListProps, 'rows'> & { row: TreeRow }

const PinnedRow: FC<PinnedRowProps> = ({
  row,
  items,
  driftedIds,
  activeFolderIds,
  activeItemId,
  iconOnly,
  onOpen,
  onSetExpansion,
  onReset,
  onUnpin,
  onRename,
  onAddEssential,
  onNewFolder,
  onClosePinned,
}) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const { item, depth } = row
  const isFolder = item.data.kind === 'folder'
  const expansion = item.data.kind === 'folder' ? item.data.expansion : null
  const drifted = driftedIds.has(item.id)
  const title =
    item.title ?? (item.data.kind === 'tab' ? item.data.savedTitle : 'Folder')
  const url = item.data.kind === 'tab' ? item.data.url : ''

  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id: item.id,
      data: {
        source: {
          zone: 'pinned',
          itemId: item.id,
          url: url || undefined,
          title,
          kind: isFolder ? 'folder' : 'tab',
        },
        target: {
          zone: 'pinned',
          parentId: item.parentId ?? '',
          index: indexInParent(items, item),
        },
      } satisfies SidebarDndData,
    })

  const folderDrop = useDroppable({
    id: `folder:${item.id}`,
    disabled: !isFolder,
    data: {
      target: { zone: 'pinned', parentId: item.id },
    } satisfies SidebarDndData,
  })

  const toggle = () => {
    if (expansion === null) return
    if (expansion === 'expanded') {
      onSetExpansion(
        item.id,
        activeFolderIds.has(item.id) ? 'peeked' : 'collapsed',
      )
      return
    }
    onSetExpansion(item.id, 'expanded')
  }

  const commitRename = () => {
    const next = (draft ?? '').trim()
    if (next && next !== title) onRename(item.id, next)
    setDraft(null)
  }

  return (
    <div
      className="relative"
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div
        className={cn(
          'group flex items-center gap-2 rounded-md px-2 hover:bg-white/10',
          activeItemId === item.id && 'bg-white/20',
          iconOnly && 'justify-center px-0',
        )}
        style={{
          height: ROW_HEIGHT,
          paddingLeft: iconOnly ? undefined : 8 + depth * 12,
        }}
      >
        {isFolder && !iconOnly && (
          <button
            type="button"
            aria-label={`${expansion === 'expanded' ? 'Collapse' : 'Expand'} ${title}`}
            onClick={toggle}
            className="shrink-0 opacity-70 hover:opacity-100"
          >
            {expansion === 'expanded' ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </button>
        )}
        {draft !== null && !iconOnly ? (
          <input
            // biome-ignore lint/a11y/noAutofocus: the inline rename replaces the label in place
            autoFocus
            aria-label="Rename item"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitRename()
              if (event.key === 'Escape') setDraft(null)
            }}
            className="h-6 min-w-0 flex-1 rounded-sm border border-[var(--sb-accent)] bg-[var(--sb-bg-toolbar)] px-1 text-[var(--sb-text)] text-xs outline-none"
          />
        ) : (
          <button
            type="button"
            title={title}
            data-pinned-row={item.id}
            onContextMenu={(event) => {
              event.preventDefault()
              setMenuOpen(true)
            }}
            onDoubleClick={() => setDraft(title)}
            onClick={() => (isFolder ? toggle() : onOpen(item.id))}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            {...attributes}
            {...listeners}
            onKeyDown={(event) => {
              // A pinned row answers Cmd+W itself; the panel has no tab to close.
              if (event.metaKey && event.key.toLowerCase() === 'w') {
                event.preventDefault()
                onClosePinned(item.id)
                return
              }
              listeners?.onKeyDown?.(event)
            }}
          >
            {isFolder ? (
              <Folder className="size-4 shrink-0 opacity-70" />
            ) : (
              <Favicon url={url} />
            )}
            {!iconOnly && (
              <span className="min-w-0 flex-1 truncate text-xs">{title}</span>
            )}
          </button>
        )}
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
      {isFolder && (
        // Drop band inset from the row edges so the edges still mean "between
        // rows" while the middle means "into this folder".
        <div
          ref={folderDrop.setNodeRef}
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-x-0 top-1.5 bottom-1.5 rounded-md',
            folderDrop.isOver && 'outline outline-[var(--sb-accent)]',
          )}
        />
      )}
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        {/* Zero-size anchor: the row itself must stay clickable, so only the
            context menu opens the dropdown. */}
        <DropdownMenuTrigger asChild>
          <span aria-hidden className="absolute bottom-0 left-4 block size-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => onUnpin(item.id)}>
            {isFolder ? 'Remove folder' : 'Unpin'}
          </DropdownMenuItem>
          {!isFolder && (
            <DropdownMenuItem onSelect={() => onAddEssential(url, title)}>
              Add to essentials
            </DropdownMenuItem>
          )}
          {!isFolder && (
            <DropdownMenuItem
              disabled={!drifted}
              onSelect={() => onReset(item.id)}
            >
              Reset to pinned page
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setDraft(title)}>
            Rename…
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              onNewFolder(isFolder ? item.id : (item.parentId ?? item.id))
            }
          >
            New folder here
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
