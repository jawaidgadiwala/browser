import { type CSSProperties, type FC, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { ArchiveHeader } from '@/components/sidebar/archive/ArchiveHeader'
import { ArchiveList } from '@/components/sidebar/archive/ArchiveList'
import { SearchBox } from '@/components/sidebar/panel/SearchBox'
import { computeTheme, themeSpecForColor } from '@/lib/sidebar/core/theme'
import type { ArchivedItem } from '@/lib/sidebar/core/types'
import { archiveActions } from '@/modules/sidebar/archive.actions'
import {
  filterArchive,
  flattenDays,
  groupByDay,
  type PurgeScope,
  purgeCutoff,
} from '@/modules/sidebar/archive.helpers'
import { useArchive } from '@/modules/sidebar/archive.hooks'

/**
 * Archived tabs, newest first, grouped by day. Restoring hands the entry to
 * the background, which reopens the tab, then returns to the sidebar.
 */
export const ArchiveScreen: FC = () => {
  const navigate = useNavigate()
  const { ready, entries, spaces, activeSpaceId } = useArchive()
  const [query, setQuery] = useState('')

  const back = () => navigate('/sidebar')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      // Escape clears an active filter first, then leaves the view.
      if (query.trim()) setQuery('')
      else navigate('/sidebar')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate, query])

  const activeSpace = activeSpaceId ? spaces[activeSpaceId] : undefined
  const theme = computeTheme(
    activeSpace?.theme ?? themeSpecForColor(activeSpace?.color ?? 'grey'),
  )

  const days = groupByDay(filterArchive(entries, query))
  const rows = flattenDays(days)

  const restore = async (entry: ArchivedItem) => {
    await archiveActions.restore(entry.item.id)
    navigate('/sidebar')
  }

  const restoreDay = async (dayKey: string) => {
    const day = days.find((candidate) => candidate.key === dayKey)
    if (!day) return
    await archiveActions.restoreMany(day.entries)
    navigate('/sidebar')
  }

  const purge = (scope: PurgeScope) => {
    void archiveActions.purge(scope === 'all' ? null : purgeCutoff(scope))
  }

  if (!ready) return null

  return (
    <div
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
      className="flex h-screen w-screen flex-col overflow-hidden text-sm"
    >
      <ArchiveHeader count={entries.length} onBack={back} onPurge={purge} />
      <SearchBox
        value={query}
        onChange={setQuery}
        onSubmit={() => {
          const first = rows.find((row) => row.kind === 'entry')
          if (first?.kind === 'entry') void restore(first.entry)
        }}
      />
      <ArchiveList
        rows={rows}
        spaces={spaces}
        emptyLabel={
          query.trim() ? 'No archived tabs match' : 'Nothing archived yet'
        }
        onRestore={(entry) => void restore(entry)}
        onRestoreDay={(dayKey) => void restoreDay(dayKey)}
      />
    </div>
  )
}
