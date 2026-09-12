import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { type CSSProperties, type FC, useState } from 'react'
import { SPACE_COLOR_HEX } from '@/components/spaces/space-colors'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Space, SpaceId } from '@/lib/sidebar/core/types'
import { useElementWidth } from '@/modules/sidebar/sidebar-layout.hooks'
import { DOT_GAP, dotSize } from '@/modules/sidebar/sidebar-rows.helpers'

export interface SpaceDotsProps {
  spaces: Space[]
  activeSpaceId: SpaceId | null
  /** The space a live swipe is heading for; its dot lights up with progress. */
  swipeTargetId?: SpaceId | null
  onSwitch: (spaceId: SpaceId) => void
  onRename: (spaceId: SpaceId, name: string) => void
  onOpenTheme: (spaceId: SpaceId) => void
  onDelete: (spaceId: SpaceId) => void
  onReorder: (spaceId: SpaceId, index: number) => void
}

/** Spec: a drag only becomes a reorder past this. */
const REORDER_THRESHOLD = 5

/** One dot per space. A single space needs no switcher, so the strip hides. */
export const SpaceDots: FC<SpaceDotsProps> = ({
  spaces,
  activeSpaceId,
  swipeTargetId,
  onSwitch,
  onRename,
  onOpenTheme,
  onDelete,
  onReorder,
}) => {
  const { ref, width } = useElementWidth<HTMLDivElement>()
  const [renaming, setRenaming] = useState<Space | null>(null)
  const [deleting, setDeleting] = useState<Space | null>(null)
  // dnd-kit keeps sensors by identity; recreating them mid-drag aborts it.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: REORDER_THRESHOLD },
    }),
  )

  if (spaces.length <= 1) return null

  const size = dotSize(spaces.length, width)

  if (renaming) {
    return (
      <div className="flex min-w-0 flex-1 items-center px-1">
        <RenameField
          space={renaming}
          onCommit={(name) => {
            if (name && name !== renaming.name) onRename(renaming.id, name)
            setRenaming(null)
          }}
          onCancel={() => setRenaming(null)}
        />
      </div>
    )
  }

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const index = spaces.findIndex((space) => space.id === over.id)
    if (index !== -1) onReorder(String(active.id), index)
  }

  return (
    <div
      ref={ref}
      role="tablist"
      aria-label="Spaces"
      className="flex min-w-0 flex-1 items-center justify-center overflow-hidden"
      style={{ gap: DOT_GAP }}
    >
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <SortableContext
          items={spaces.map((space) => space.id)}
          strategy={horizontalListSortingStrategy}
        >
          {spaces.map((space) => (
            <Dot
              key={space.id}
              space={space}
              size={size}
              active={space.id === activeSpaceId}
              swipeTarget={space.id === swipeTargetId}
              onSwitch={() => onSwitch(space.id)}
              onRename={() => setRenaming(space)}
              onOpenTheme={() => onOpenTheme(space.id)}
              onDelete={() => setDeleting(space)}
            />
          ))}
        </SortableContext>
      </DndContext>
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its tabs are ungrouped, and its pinned tabs are archived.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) onDelete(deleting.id)
                setDeleting(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

const Dot: FC<{
  space: Space
  size: number
  active: boolean
  swipeTarget: boolean
  onSwitch: () => void
  onRename: () => void
  onOpenTheme: () => void
  onDelete: () => void
}> = ({
  space,
  size,
  active,
  swipeTarget,
  onSwitch,
  onRename,
  onOpenTheme,
  onDelete,
}) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useSortable({ id: space.id })

  // The highlight follows the swipe in CSS, so no render happens per frame.
  const opacity = active
    ? 'calc(1 - 0.55 * var(--sb-progress, 0))'
    : swipeTarget
      ? 'calc(0.45 + 0.55 * var(--sb-progress, 0))'
      : '0.45'

  return (
    <>
      <button
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        type="button"
        // The sortable attributes carry role="button"; the dots are a tablist.
        role="tab"
        aria-selected={active}
        aria-label={space.name}
        title={space.name}
        onClick={onSwitch}
        onContextMenu={(event) => {
          event.preventDefault()
          setMenuOpen(true)
        }}
        style={
          {
            width: size,
            height: size,
            backgroundColor: SPACE_COLOR_HEX[space.color],
            opacity,
            outline: active ? '2px solid var(--sb-text)' : undefined,
            outlineOffset: 1,
            transform: CSS.Transform.toString(transform),
            zIndex: isDragging ? 1 : undefined,
          } as CSSProperties
        }
        className="flex shrink-0 items-center justify-center rounded-full text-[10px] leading-none transition-opacity hover:opacity-100"
      >
        {size >= 24 ? space.icon : null}
      </button>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <span aria-hidden className="block size-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top">
          <DropdownMenuItem onSelect={onRename}>Rename</DropdownMenuItem>
          <DropdownMenuItem onSelect={onOpenTheme}>Theme…</DropdownMenuItem>
          <DropdownMenuItem onSelect={onDelete}>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

const RenameField: FC<{
  space: Space
  onCommit: (name: string) => void
  onCancel: () => void
}> = ({ space, onCommit, onCancel }) => {
  const [value, setValue] = useState(space.name)
  return (
    <input
      // biome-ignore lint/a11y/noAutofocus: the field replaces the dots in place
      autoFocus
      aria-label={`Rename ${space.name}`}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onCommit(value.trim())}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onCommit(value.trim())
        if (event.key === 'Escape') onCancel()
      }}
      className="h-6 min-w-0 flex-1 rounded-md border border-[var(--sb-accent)] bg-[var(--sb-bg-toolbar)] px-2 text-[var(--sb-text)] text-xs outline-none"
    />
  )
}
