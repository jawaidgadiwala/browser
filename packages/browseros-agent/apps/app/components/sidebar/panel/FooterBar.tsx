import { Archive, Download, MessageSquare, Plus, Settings } from 'lucide-react'
import { type FC, type ReactNode, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  SpaceDialog,
  type SpaceDialogValues,
} from '@/components/spaces/SpaceDialog'
import type { Space, SpaceId } from '@/lib/sidebar/core/types'
import { nextColor } from '@/lib/spaces/spaces.helpers'
import { countLast24h } from '@/modules/sidebar/archive.helpers'
import {
  useArchiveCount,
  useArchiveToast,
} from '@/modules/sidebar/archive.hooks'
import { SpaceDots } from './SpaceDots'

export interface FooterBarProps {
  spaces: Space[]
  activeSpaceId: SpaceId | null
  swipeTargetId?: SpaceId | null
  onSwitch: (spaceId: SpaceId) => void
  onRenameSpace: (spaceId: SpaceId, name: string) => void
  onOpenTheme: (spaceId: SpaceId) => void
  onDeleteSpace: (spaceId: SpaceId) => void
  onReorderSpace: (spaceId: SpaceId, index: number) => void
  onCreate: (values: SpaceDialogValues) => Promise<void>
  onOpenSettings: () => void
  onOpenDownloads: () => void
  onOpenChat: () => void
}

export const FooterBar: FC<FooterBarProps> = ({
  spaces,
  activeSpaceId,
  swipeTargetId,
  onSwitch,
  onRenameSpace,
  onOpenTheme,
  onDeleteSpace,
  onReorderSpace,
  onCreate,
  onOpenSettings,
  onOpenDownloads,
  onOpenChat,
}) => {
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()
  // The footer is always mounted on the sidebar surface, so it owns the
  // Tidy / Clear undo toast.
  useArchiveToast()
  const archived = countLast24h(useArchiveCount())

  return (
    <div className="flex items-center gap-1 border-white/15 border-t bg-[var(--sb-bg-toolbar)] px-2 py-1.5">
      <FooterButton label="Space settings" onClick={onOpenSettings}>
        <Settings className="size-4" />
      </FooterButton>
      <SpaceDots
        spaces={spaces}
        activeSpaceId={activeSpaceId}
        swipeTargetId={swipeTargetId}
        onSwitch={onSwitch}
        onRename={onRenameSpace}
        onOpenTheme={onOpenTheme}
        onDelete={onDeleteSpace}
        onReorder={onReorderSpace}
      />
      <FooterButton label="New space" onClick={() => setCreating(true)}>
        <Plus className="size-4" />
      </FooterButton>
      <FooterButton
        label={archived > 0 ? `Archive (${archived} in 24 h)` : 'Archive'}
        onClick={() => navigate('/sidebar/archive')}
      >
        <span className="relative flex">
          <Archive className="size-4" />
          {archived > 0 && (
            <span className="absolute -top-1 -right-1.5 rounded-full bg-[var(--sb-accent)] px-1 text-[9px] text-white leading-3">
              {archived > 99 ? '99+' : archived}
            </span>
          )}
        </span>
      </FooterButton>
      <FooterButton label="Downloads" onClick={onOpenDownloads}>
        <Download className="size-4" />
      </FooterButton>
      <FooterButton label="Open chat" onClick={onOpenChat}>
        <MessageSquare className="size-4" />
      </FooterButton>
      <SpaceDialog
        open={creating}
        onOpenChange={setCreating}
        spaces={spaces}
        defaultColor={nextColor(spaces)}
        onSubmit={onCreate}
      />
    </div>
  )
}

const FooterButton: FC<{
  label: string
  onClick: () => void
  children: ReactNode
}> = ({ label, onClick, children }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    className="shrink-0 rounded-md p-1.5 opacity-75 hover:bg-white/15 hover:opacity-100"
  >
    {children}
  </button>
)
