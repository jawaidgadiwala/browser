import { Download, MessageSquare, Plus, Settings } from 'lucide-react'
import { type FC, type ReactNode, useState } from 'react'
import {
  SpaceDialog,
  type SpaceDialogValues,
} from '@/components/spaces/SpaceDialog'
import type { Space, SpaceId } from '@/lib/sidebar/core/types'
import { nextColor } from '@/lib/spaces/spaces.helpers'
import { SpaceDots } from './SpaceDots'

export interface FooterBarProps {
  spaces: Space[]
  activeSpaceId: SpaceId | null
  onSwitch: (spaceId: SpaceId) => void
  onCreate: (values: SpaceDialogValues) => Promise<void>
  onOpenSettings: () => void
  onOpenDownloads: () => void
  onOpenChat: () => void
}

export const FooterBar: FC<FooterBarProps> = ({
  spaces,
  activeSpaceId,
  onSwitch,
  onCreate,
  onOpenSettings,
  onOpenDownloads,
  onOpenChat,
}) => {
  const [creating, setCreating] = useState(false)

  return (
    <div className="flex items-center gap-1 border-white/15 border-t bg-[var(--sb-bg-toolbar)] px-2 py-1.5">
      <FooterButton label="Space settings" onClick={onOpenSettings}>
        <Settings className="size-4" />
      </FooterButton>
      <SpaceDots
        spaces={spaces}
        activeSpaceId={activeSpaceId}
        onSwitch={onSwitch}
      />
      <FooterButton label="New space" onClick={() => setCreating(true)}>
        <Plus className="size-4" />
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
