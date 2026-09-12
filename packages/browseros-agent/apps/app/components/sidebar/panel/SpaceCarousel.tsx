import {
  type CSSProperties,
  type FC,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  type CarouselSlot,
  carouselWindow,
  pageStep,
  SWIPE_ANIMATION_MS,
  SWIPE_WATCHDOG_MS,
} from '@/lib/sidebar/core/paging'
import type { SpaceId } from '@/lib/sidebar/core/types'

export interface SpaceCarouselProps {
  order: SpaceId[]
  activeSpaceId: SpaceId | null
  wrap: boolean
  renderStrip: (spaceId: SpaceId, active: boolean) => ReactNode
}

/**
 * A track of absolutely stacked strips. Only the active space and its two ring
 * neighbours are mounted; the page counter accumulates, so a switch never
 * re-seats the mounted strips and the transform can just animate.
 */
export const SpaceCarousel: FC<SpaceCarouselProps> = ({
  order,
  activeSpaceId,
  wrap,
  renderStrip,
}) => {
  const [page, setPage] = useState(0)
  const [outgoing, setOutgoing] = useState<CarouselSlot | null>(null)
  const previous = useRef<{ spaceId: SpaceId | null; page: number }>({
    spaceId: activeSpaceId,
    page: 0,
  })

  useEffect(() => {
    const from = previous.current
    if (from.spaceId === activeSpaceId) return
    const step = pageStep(order, from.spaceId, activeSpaceId, wrap)
    const next = from.page + step
    previous.current = { spaceId: activeSpaceId, page: next }
    setPage(next)
    if (from.spaceId && step !== 0) {
      setOutgoing({ spaceId: from.spaceId, slot: from.page })
    }
    // `transitionend` can be missed entirely when the panel is hidden mid
    // switch, so the watchdog is what guarantees the strip is unmounted.
    const timer = setTimeout(
      () => setOutgoing(null),
      SWIPE_ANIMATION_MS + SWIPE_WATCHDOG_MS,
    )
    return () => clearTimeout(timer)
  }, [activeSpaceId, order, wrap])

  const slots = carouselWindow(order, activeSpaceId, page, wrap)
  const mounted =
    outgoing && !slots.some((slot) => slot.spaceId === outgoing.spaceId)
      ? [...slots, outgoing]
      : slots

  return (
    <div className="sb-carousel min-h-0 flex-1">
      <div
        className="sb-carousel-track"
        style={{ '--sb-page': page } as CSSProperties}
        onTransitionEnd={(event) => {
          if (event.propertyName === 'transform') setOutgoing(null)
        }}
      >
        {mounted.map(({ spaceId, slot }) => {
          const active = spaceId === activeSpaceId
          return (
            <div
              key={spaceId}
              className="sb-carousel-strip"
              style={{ '--sb-slot': slot } as CSSProperties}
              // Neighbours are decoration until they are switched to.
              inert={!active}
              aria-hidden={!active}
            >
              {renderStrip(spaceId, active)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
