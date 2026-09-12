import { type RefObject, useEffect, useRef, useState } from 'react'
import {
  classifyWheel,
  createWheelAccumulator,
  pixelsOf,
  rubberBand,
  SWIPE_ANIMATION_MS,
  SWIPE_IDLE_MS,
  shouldCommit,
  swipeDelta,
  type VelocitySample,
  velocityOf,
  WHEEL_DISTANCE_THRESHOLD,
} from '@/lib/sidebar/core/paging'
import { adjacentSpace } from '@/lib/sidebar/core/selectors'
import type { SpaceId } from '@/lib/sidebar/core/types'

/**
 * Horizontal space switching from the panel's own `wheel` stream. Two physics:
 * a trackpad drags the carousel live and commits on release, a notched wheel
 * steps once it has travelled far enough.
 *
 * Nothing here re-renders per frame: the drag writes two custom properties on
 * the panel root inside one rAF, and React only sees the swipe direction,
 * which changes at most once per gesture.
 */

export interface SwipeOptions {
  order: SpaceId[]
  activeSpaceId: SpaceId | null
  width: number
  wrap: boolean
  naturalScroll: boolean
  onSwitch: (spaceId: SpaceId) => void
}

/** Samples kept for the release velocity. */
const VELOCITY_SAMPLES = 3

/** A commit that never lands (no handler, no target) must not strand the drag. */
const COMMIT_TIMEOUT_MS = 1000

export function useSwipe(
  ref: RefObject<HTMLElement | null>,
  options: SwipeOptions,
): { direction: -1 | 0 | 1 } {
  // Listeners attach once for the life of the panel; reading options through a
  // ref keeps a changing space list from tearing an in-flight gesture down.
  const latest = useRef(options)
  latest.current = options
  const [direction, setDirection] = useState<-1 | 0 | 1>(0)
  const reset = useRef<() => void>(() => {})

  useEffect(() => {
    const element = ref.current
    if (!element) return

    let offset = 0
    let frame = 0
    let idle: ReturnType<typeof setTimeout> | undefined
    let settle: ReturnType<typeof setTimeout> | undefined
    let dragging = false
    let samples: VelocitySample[] = []
    const wheelSteps = createWheelAccumulator({
      threshold: WHEEL_DISTANCE_THRESHOLD,
    })

    /**
     * After a commit the theme cross-fade owns `--sb-fade` and has to carry it
     * on to 1; only a cancelled gesture may pull it back.
     */
    let keepFade = false

    const write = () => {
      frame = 0
      const { width } = latest.current
      const progress = width > 0 ? Math.min(1, Math.abs(offset) / width) : 0
      element.style.setProperty('--sb-swipe-x', `${offset}px`)
      element.style.setProperty('--sb-progress', String(progress))
      if (!keepFade) element.style.setProperty('--sb-fade', String(progress))
    }

    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(write)
    }

    const stopDrag = () => {
      dragging = false
      samples = []
      element.style.removeProperty('--sb-anim-ms')
    }

    const release = () => {
      clearTimeout(settle)
      settle = setTimeout(() => setDirection(0), SWIPE_ANIMATION_MS)
    }

    const cancel = () => {
      stopDrag()
      keepFade = false
      offset = 0
      write()
      release()
    }

    const end = () => {
      if (!dragging) return
      const { order, activeSpaceId, width, wrap, onSwitch } = latest.current
      const progress = width > 0 ? Math.min(1, Math.abs(offset) / width) : 0
      const velocity = velocityOf(samples)
      const target =
        offset === 0
          ? null
          : adjacentSpace(order, activeSpaceId, offset < 0 ? 1 : -1, wrap)
      if (!target || target === activeSpaceId) {
        cancel()
        return
      }
      if (!shouldCommit({ progress, velocity })) {
        cancel()
        return
      }
      stopDrag()
      keepFade = true
      // The offset is held until the store reports the new active space, so the
      // track animates straight on from where the fingers left it.
      clearTimeout(settle)
      settle = setTimeout(() => {
        keepFade = false
        offset = 0
        write()
        setDirection(0)
      }, COMMIT_TIMEOUT_MS)
      onSwitch(target)
    }

    const drag = (dx: number, timeStamp: number) => {
      const { order, activeSpaceId, width, wrap } = latest.current
      if (!dragging) {
        dragging = true
        offset = 0
        samples = []
        element.style.setProperty('--sb-anim-ms', '0ms')
      }
      offset -= dx
      const towards = offset < 0 ? 1 : -1
      const target = adjacentSpace(order, activeSpaceId, towards, wrap)
      if (!target || target === activeSpaceId)
        offset = rubberBand(offset, width)
      else if (width > 0) offset = Math.max(-width, Math.min(width, offset))
      setDirection(towards)
      samples.push({ x: offset, t: timeStamp })
      if (samples.length > VELOCITY_SAMPLES) samples.shift()
      schedule()
      clearTimeout(idle)
      idle = setTimeout(end, SWIPE_IDLE_MS)
    }

    const onWheel = (event: WheelEvent) => {
      const { order, activeSpaceId, wrap, naturalScroll, onSwitch } =
        latest.current
      const kind = classifyWheel(event)
      if (kind === 'ignore') return
      const dx = swipeDelta(event.deltaX, naturalScroll)

      if (kind === 'wheel') {
        const step = wheelSteps.push(
          pixelsOf(dx, event.deltaMode),
          event.timeStamp,
        )
        if (step === 0) return
        const target = adjacentSpace(order, activeSpaceId, step, wrap)
        if (target && target !== activeSpaceId) onSwitch(target)
        return
      }
      drag(dx, event.timeStamp)
    }

    reset.current = () => {
      if (offset === 0 && !dragging) return
      clearTimeout(settle)
      stopDrag()
      offset = 0
      write()
      keepFade = false
      release()
    }

    element.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      element.removeEventListener('wheel', onWheel)
      clearTimeout(idle)
      clearTimeout(settle)
      cancelAnimationFrame(frame)
      reset.current = () => {}
    }
  }, [ref])

  // The committed switch arrives asynchronously through storage; that is the
  // cue to let the held drag offset animate into the new page.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the active space is the only trigger; `reset` is a stable ref.
  useEffect(() => {
    reset.current()
  }, [options.activeSpaceId])

  return { direction }
}
