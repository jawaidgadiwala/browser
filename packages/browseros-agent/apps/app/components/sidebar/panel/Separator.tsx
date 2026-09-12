import { Eraser, Plus, Sparkles } from 'lucide-react'
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
import { cn } from '@/lib/utils'

export interface SeparatorProps {
  iconOnly?: boolean
  onNewTab: () => void
  onTidy: () => void
  onClear: () => void
}

/** The line between pinned and today, doubling as the per-space action bar. */
export const Separator: FC<SeparatorProps> = ({
  iconOnly,
  onNewTab,
  onTidy,
  onClear,
}) => {
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <div
        className={cn(
          'mt-1 flex items-center gap-1 border-white/15 border-t px-2 pt-1 pb-1',
          iconOnly && 'flex-col',
        )}
      >
        <button
          type="button"
          onClick={onNewTab}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs hover:bg-white/10"
        >
          <Plus className="size-3.5 shrink-0" />
          {!iconOnly && <span className="truncate">New Tab</span>}
        </button>
        <button
          type="button"
          onClick={onTidy}
          title="Archive the tabs in this space"
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs opacity-80 hover:bg-white/10 hover:opacity-100"
        >
          <Sparkles className="size-3.5" />
          {!iconOnly && 'Tidy'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          title="Archive and close the tabs in this space"
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs opacity-80 hover:bg-white/10 hover:opacity-100"
        >
          <Eraser className="size-3.5" />
          {!iconOnly && 'Clear'}
        </button>
      </div>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear this space?</AlertDialogTitle>
            <AlertDialogDescription>
              Every open tab in this space is archived and closed. Pinned tabs
              stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirming(false)
                onClear()
              }}
            >
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
