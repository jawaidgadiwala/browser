import {
  FolderInput,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { type FC, useState } from 'react'
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { nextColor, spaceGlyph } from '@/lib/spaces/spaces.helpers'
import type { Space } from '@/lib/spaces/spaces.types'
import { cn } from '@/lib/utils'
import { useSpaces } from '@/modules/spaces/spaces.hooks'
import { SpaceDialog } from './SpaceDialog'
import { SPACE_COLOR_HEX } from './space-colors'

/**
 * Horizontal row of space pills on the new tab. Click switches, the menu
 * edits. Chromium draws the matching tab group in the sidebar; this bar is
 * the part an extension can own.
 */
export const SpacesBar: FC = () => {
  const api = useSpaces()
  const { spaces, activeSpaceId, ready } = api
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Space | undefined>()
  const [deleting, setDeleting] = useState<Space | undefined>()

  if (!ready) return null

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex w-full items-center justify-center px-4 pt-4">
        <div
          role="tablist"
          aria-label="Spaces"
          className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-border/60 bg-card/70 p-1 shadow-sm backdrop-blur"
        >
          {spaces.length === 0 && (
            <span className="flex items-center gap-2 px-3 text-muted-foreground text-xs">
              <Layers className="size-3.5" />
              No spaces yet
            </span>
          )}
          {spaces.map((space, index) => {
            const active = space.id === activeSpaceId
            const color = SPACE_COLOR_HEX[space.color]
            return (
              <div key={space.id} className="group relative flex items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => api.switchTo(space.id)}
                      className={cn(
                        'flex h-8 items-center gap-2 rounded-full pr-7 pl-3 font-medium text-sm transition-colors',
                        active
                          ? 'text-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                      style={
                        active ? { backgroundColor: `${color}26` } : undefined
                      }
                    >
                      <span
                        className="flex size-5 items-center justify-center rounded-full text-[11px] leading-none"
                        style={{
                          backgroundColor: color,
                          color: 'white',
                        }}
                      >
                        {spaceGlyph(space)}
                      </span>
                      <span className="max-w-[10rem] truncate">
                        {space.name}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {index < 9 ? `Space ${index + 1}` : space.name}
                  </TooltipContent>
                </Tooltip>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`${space.name} options`}
                      className="absolute right-1.5 flex size-5 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100 data-[state=open]:opacity-100"
                    >
                      <MoreHorizontal className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem
                      onClick={() => api.assignActiveTab(space.id)}
                    >
                      <FolderInput className="size-4" />
                      Move current tab here
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => api.adoptLooseTabs(space.id)}
                    >
                      <Layers className="size-4" />
                      Adopt ungrouped tabs
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setEditing(space)}>
                      <Pencil className="size-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setDeleting(space)}
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )
          })}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="New space"
                onClick={() => setCreating(true)}
                className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Plus className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">New space</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <SpaceDialog
        open={creating}
        onOpenChange={setCreating}
        spaces={spaces}
        defaultColor={nextColor(spaces)}
        onSubmit={async (values) => {
          await api.create(values)
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
      <AlertDialog
        open={deleting !== undefined}
        onOpenChange={(open) => {
          if (!open) setDeleting(undefined)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its tabs stay open and become ungrouped. Only the space is
              removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) void api.remove(deleting.id)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  )
}
