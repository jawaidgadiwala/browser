import { type FC, useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router'
import { ChatLayout } from '@/components/layout/ChatLayout'
import {
  modeForPath,
  otherMode,
  routeForMode,
  setPanelMode,
  usePanelMode,
} from '@/modules/sidebar/panel-mode'
import { ArchiveScreen } from '@/screens/sidebar/ArchiveScreen'
import { SidebarScreen } from '@/screens/sidebar/SidebarScreen'
import { ChatHistory } from '@/screens/sidepanel/history/ChatHistory'
import { Chat } from '@/screens/sidepanel/index/Chat'

/** The panel opens on whichever surface was last used. */
const ModeRedirect: FC = () => {
  const { mode, ready } = usePanelMode()
  if (!ready) return null
  return <Navigate replace to={routeForMode(mode)} />
}

/**
 * ⌥⇧B back to the sidebar. The sidebar surface handles the other direction
 * itself, so this only fires on the chat routes.
 */
const SidebarShortcut: FC = () => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || !event.shiftKey || event.code !== 'KeyB') return
      const next = otherMode(modeForPath(window.location.hash.slice(1)))
      if (next === 'chat') return
      event.preventDefault()
      setPanelMode(next)
      window.location.hash = `#${routeForMode(next)}`
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
  return null
}

export const App: FC = () => {
  return (
    <HashRouter>
      <SidebarShortcut />
      <Routes>
        <Route index element={<ModeRedirect />} />
        <Route path="sidebar" element={<SidebarScreen />} />
        <Route path="sidebar/archive" element={<ArchiveScreen />} />
        <Route element={<ChatLayout />}>
          <Route path="chat" element={<Chat />} />
          <Route path="history" element={<ChatHistory />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
