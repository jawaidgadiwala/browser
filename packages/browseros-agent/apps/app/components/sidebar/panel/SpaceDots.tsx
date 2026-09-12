import type { FC } from 'react'
import { SPACE_COLOR_HEX } from '@/components/spaces/space-colors'
import type { Space, SpaceId } from '@/lib/sidebar/core/types'
import { useElementWidth } from '@/modules/sidebar/sidebar-layout.hooks'
import { DOT_GAP, dotSize } from '@/modules/sidebar/sidebar-rows.helpers'

export interface SpaceDotsProps {
  spaces: Space[]
  activeSpaceId: SpaceId | null
  onSwitch: (spaceId: SpaceId) => void
}

/** One dot per space. A single space needs no switcher, so the strip hides. */
export const SpaceDots: FC<SpaceDotsProps> = ({
  spaces,
  activeSpaceId,
  onSwitch,
}) => {
  const { ref, width } = useElementWidth<HTMLDivElement>()

  if (spaces.length <= 1) return null

  const size = dotSize(spaces.length, width)

  return (
    <div
      ref={ref}
      role="tablist"
      aria-label="Spaces"
      className="flex min-w-0 flex-1 items-center justify-center overflow-hidden"
      style={{ gap: DOT_GAP }}
    >
      {spaces.map((space) => {
        const active = space.id === activeSpaceId
        return (
          <button
            key={space.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={space.name}
            title={space.name}
            onClick={() => onSwitch(space.id)}
            style={{
              width: size,
              height: size,
              backgroundColor: SPACE_COLOR_HEX[space.color],
              opacity: active ? 1 : 0.45,
              outline: active ? '2px solid var(--sb-text)' : undefined,
              outlineOffset: 1,
            }}
            className="flex shrink-0 items-center justify-center rounded-full text-[10px] leading-none transition-opacity hover:opacity-100"
          >
            {size >= 24 ? space.icon : null}
          </button>
        )
      })}
    </div>
  )
}
