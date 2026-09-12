import type { FC } from 'react'
import { Outlet, useLocation } from 'react-router'
import { SpacesBar } from '@/components/spaces/SpacesBar'
import { SpacesSwitcher } from '@/components/spaces/SpacesSwitcher'
import { ChatSessionProvider } from '@/modules/chat/chat-session-context'
import { NewTabFocusGrid } from './NewTabFocusGrid'
import {
  isAgentCommandPath,
  shouldHideFocusGrid,
  shouldUseChatSession,
} from './route-utils'

export const NewTabLayout: FC = () => {
  const location = useLocation()
  const hideGrid = shouldHideFocusGrid(location.pathname)
  const useChatSession = shouldUseChatSession(location.pathname)
  const showSpaces = isAgentCommandPath(location.pathname)
  const content = (
    <>
      {!hideGrid && <NewTabFocusGrid />}
      {showSpaces && <SpacesBar />}
      <SpacesSwitcher />
      <Outlet />
    </>
  )

  if (!useChatSession) return content

  // Each history selection gets its own SDK session and composer. A late
  // stream or restore from the previous selection cannot replace this view.
  const conversationId = new URLSearchParams(location.search).get(
    'conversationId',
  )
  return (
    <ChatSessionProvider key={conversationId ?? 'new'} origin="newtab">
      {content}
    </ChatSessionProvider>
  )
}
