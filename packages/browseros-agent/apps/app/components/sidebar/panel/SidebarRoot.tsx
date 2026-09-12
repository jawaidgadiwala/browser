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
  /** Painted over the base layer at `--sb-fade`: the space being switched to. */
  overlayTheme?: Theme
  baseGradient: string
  overlayGradient: string
  noise: number
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
  overlayTheme,
  baseGradient,
  overlayGradient,
  noise,
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

  // Text and accent belong to whichever theme the fade has mostly reached.
  const front = overlayTheme ?? theme

  return (
    <div
      ref={ref}
      data-sidebar-root
      style={
        {
          '--sb-bg': theme.bg,
          '--sb-bg-toolbar': `color-mix(in oklab, ${front.bgToolbar} calc(round(var(--sb-fade), 1) * 100%), ${theme.bgToolbar})`,
          '--sb-accent': `color-mix(in oklab, ${front.accent} calc(round(var(--sb-fade), 1) * 100%), ${theme.accent})`,
          '--sb-text': `color-mix(in oklab, ${front.text} calc(round(var(--sb-fade), 1) * 100%), ${theme.text})`,
          backgroundColor: 'var(--sb-bg)',
          color: 'var(--sb-text)',
        } as CSSProperties
      }
      className={cn(
        'relative flex h-screen w-screen flex-col overflow-hidden text-sm',
        className,
      )}
    >
      <div className="sb-bg-layer" style={{ background: baseGradient }} />
      <div
        className="sb-bg-layer sb-bg-overlay"
        style={{ background: overlayGradient }}
      />
      {noise > 0 && (
        <div className="sb-bg-layer sb-bg-noise" style={{ opacity: noise }} />
      )}
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  )
}
