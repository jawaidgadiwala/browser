import { ArrowRight, Sparkles } from 'lucide-react'
import type { FC } from 'react'
import { cn } from '@/lib/utils'

/** Settings → AI & Agents, reachable from every extension surface. */
const AI_SETTINGS_URL = '/app.html#/settings/ai'

export interface NoChatTargetNoticeProps {
  className?: string
}

/**
 * Shown wherever chat needs a model but the profile has none.
 *
 * This build ships no hosted provider, so an empty provider list is a normal
 * first-run state rather than an error: the user brings an API key or connects
 * a coding agent before anything can be sent.
 */
export const NoChatTargetNotice: FC<NoChatTargetNoticeProps> = ({
  className,
}) => (
  <div
    className={cn(
      'flex min-h-full w-full flex-col items-center justify-center gap-4 p-6 text-center',
      className,
    )}
  >
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
      <Sparkles className="h-7 w-7 text-[var(--accent-orange)]" />
    </div>
    <div>
      <h2 className="mb-1 font-semibold text-lg">No AI provider yet</h2>
      <p className="max-w-[260px] text-muted-foreground text-xs">
        Add a provider or connect Claude Code to start chatting.
      </p>
    </div>
    <a
      href={AI_SETTINGS_URL}
      className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-orange)] px-3 py-2 font-medium text-sm text-white transition-colors hover:bg-[var(--accent-orange-bright)]"
    >
      Open AI &amp; Agents
      <ArrowRight aria-hidden="true" className="size-3.5" />
    </a>
  </div>
)
