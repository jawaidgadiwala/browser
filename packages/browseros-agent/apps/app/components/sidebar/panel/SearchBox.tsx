import { Search, X } from 'lucide-react'
import type { FC } from 'react'
import { cn } from '@/lib/utils'

export interface SearchBoxProps {
  value: string
  onChange: (value: string) => void
  /** Enter activates the first match. */
  onSubmit: () => void
  iconOnly?: boolean
  className?: string
}

export const SearchBox: FC<SearchBoxProps> = ({
  value,
  onChange,
  onSubmit,
  iconOnly,
  className,
}) => {
  if (iconOnly) {
    return (
      <div className={cn('flex justify-center px-1 py-2', className)}>
        <Search className="size-4 opacity-70" />
      </div>
    )
  }

  return (
    <div className={cn('relative px-2 py-2', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 opacity-60" />
      <input
        type="search"
        value={value}
        aria-label="Search tabs"
        placeholder="Search tabs"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onSubmit()
          }
          if (event.key === 'Escape') onChange('')
        }}
        className="h-8 w-full rounded-md border border-white/10 bg-[var(--sb-bg-toolbar)] pr-7 pl-7 text-[var(--sb-text)] text-xs outline-none placeholder:opacity-60 focus:border-[var(--sb-accent)]"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute top-1/2 right-4 -translate-y-1/2 opacity-60 hover:opacity-100"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}
