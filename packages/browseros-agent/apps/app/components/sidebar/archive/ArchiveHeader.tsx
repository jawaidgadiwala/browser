import { ArrowLeft, MoreVertical } from 'lucide-react'
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { PurgeScope } from '@/modules/sidebar/archive.helpers'

const PURGE_ITEMS: Array<{ scope: PurgeScope; label: string }> = [
  { scope: '7d', label: 'Purge older than 7 days' },
  { scope: '30d', label: 'Purge older than 30 days' },
  { scope: 'all', label: 'Purge everything' },
]

export interface ArchiveHeaderProps {
  count: number
  onBack: () => void
  onPurge: (scope: PurgeScope) => void
}

export const ArchiveHeader: FC<ArchiveHeaderProps> = ({
  count,
  onBack,
  onPurge,
}) => {
  const [pending, setPending] = useState<PurgeScope | null>(null)
  const label = PURGE_ITEMS.find((item) => item.scope === pending)?.label ?? ''

  return (
    <div className="flex items-center gap-1 border-white/15 border-b px-2 py-1.5">
      <button
        type="button"
        aria-label="Back to sidebar"
        title="Back to sidebar"
        onClick={onBack}
        className="rounded-md p-1.5 opacity-75 hover:bg-white/15 hover:opacity-100"
      >
        <ArrowLeft className="size-4" />
      </button>
      <span className="font-medium text-xs">Archive</span>
      <span className="text-[10px] opacity-60">{count}</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Archive menu"
          className="ml-auto rounded-md p-1.5 opacity-75 hover:bg-white/15 hover:opacity-100"
        >
          <MoreVertical className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {PURGE_ITEMS.map((item) => (
            <DropdownMenuItem
              key={item.scope}
              onSelect={() => setPending(item.scope)}
            >
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{label}?</AlertDialogTitle>
            <AlertDialogDescription>
              Purged entries cannot be restored.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) onPurge(pending)
                setPending(null)
              }}
            >
              Purge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
