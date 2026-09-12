import {
  type CSSProperties,
  type FC,
  type ReactNode,
  type Ref,
  useEffect,
  useRef,
} from 'react'
import type { Theme } from '@/lib/sidebar/core/theme'
import { cn } from '@/lib/utils'
import './sidebar-panel.css'

export interface SidebarRootProps {
  ref?: Ref<HTMLDivElement>
  theme: Theme
  onNextSpace: () => void
  onPrevSpace: () => void
  onToggleMode: () => void
  children: ReactNode
  className?: string
}

/**
 * Owns the theme variables and the panel-level keyboard map. ⌥⇧←/→ are also
 * manifest commands, so this handler only fires when the browser leaves the
 * event to the page.
 */
export const SidebarRoot: FC<SidebarRootProps> = ({
  ref,
  theme,
  onNextSpace,
  onPrevSpace,
  onToggleMode,
  children,
  className,
}) => {
  const handlers = useRef({ onNextSpace, onPrevSpace, onToggleMode })
  handlers.current = { onNextSpace, onPrevSpace, onToggleMode }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || !event.shiftKey) return
      if (event.code === 'ArrowRight') {
        event.preventDefault()
        handlers.current.onNextSpace()
      } else if (event.code === 'ArrowLeft') {
        event.preventDefault()
        handlers.current.onPrevSpace()
      } else if (event.code === 'KeyB') {
        event.preventDefault()
        handlers.current.onToggleMode()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div
      ref={ref}
      data-sidebar-root
      style={
        {
          '--sb-bg': theme.bg,
          '--sb-bg-toolbar': theme.bgToolbar,
          '--sb-accent': theme.accent,
          '--sb-text': theme.text,
          backgroundColor: 'var(--sb-bg)',
          color: 'var(--sb-text)',
        } as CSSProperties
      }
      className={cn(
        'flex h-screen w-screen flex-col overflow-hidden text-sm',
        className,
      )}
    >
      {children}
    </div>
  )
}
