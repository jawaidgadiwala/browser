import type { SpaceId } from './types'

/**
 * Carousel math. The whole surface — dots, header, theme cross-fade — reads
 * one position triple, so a swipe, a wheel and a keyboard switch all drive
 * the same interpolation.
 */

/** Rubber-band softening reaches this multiple of the track width at most. */
const RUBBER_BAND_LIMIT = 4.5

/** Commit when the drag passed this share of the width. */
export const COMMIT_PROGRESS = 0.35

/** …or when it was flicked faster than this, in px/ms. */
export const COMMIT_VELOCITY = 0.5

export const WHEEL_COOLDOWN_MS = 200
export const WHEEL_MIN_DELTA = 1
export const WHEEL_THRESHOLD = 30

/**
 * @public
 */
export interface PagePosition {
  floorId: SpaceId | null
  ceilId: SpaceId | null
  progress: number
}

/**
 * Where the track sits for a drag of `dx` px. Negative `dx` moves toward the
 * next space. `progress` is the 0..1 share travelled from floor to ceil.
 */
export function positionFor(
  order: SpaceId[],
  activeId: SpaceId | null,
  dx: number,
  width: number,
  wrap = false,
): PagePosition {
  const index = order.indexOf(activeId ?? '')
  if (index === -1 || order.length === 0) {
    return { floorId: null, ceilId: null, progress: 0 }
  }
  if (width <= 0 || dx === 0) {
    return { floorId: order[index], ceilId: order[index], progress: 0 }
  }
  const step = Math.min(1, Math.abs(dx) / width)
  const direction = dx < 0 ? 1 : -1
  let neighbour = index + direction
  if (neighbour < 0 || neighbour >= order.length) {
    if (!wrap)
      return { floorId: order[index], ceilId: order[index], progress: 0 }
    neighbour = (neighbour + order.length) % order.length
  }
  return direction === 1
    ? { floorId: order[index], ceilId: order[neighbour], progress: step }
    : { floorId: order[neighbour], ceilId: order[index], progress: 1 - step }
}

/**
 * Softened offset past an edge. Monotonic in `x` and bounded by
 * `RUBBER_BAND_LIMIT * width`; the small-offset slope matches
 * `1 − |x| / (4.5·width)`.
 */
export function rubberBand(x: number, width: number): number {
  if (width <= 0) return 0
  const limit = RUBBER_BAND_LIMIT * width
  const distance = Math.abs(x)
  return Math.sign(x) * ((limit * distance) / (limit + distance))
}

/** Backdrop fade during a swipe, 1 at rest down to 0. */
export function backgroundFade(x: number): number {
  return Math.max(0, 1 - Math.abs(x) / 200)
}

export function shouldCommit(input: {
  progress: number
  velocity: number
}): boolean {
  return (
    input.progress >= COMMIT_PROGRESS ||
    Math.abs(input.velocity) > COMMIT_VELOCITY
  )
}

/**
 * @public
 */
export interface WheelAccumulatorOptions {
  cooldownMs?: number
  minDelta?: number
  threshold?: number
}

/**
 * @public
 */
export interface WheelAccumulator {
  /** Returns -1, 0 or 1: the number of spaces to step for this event. */
  push(deltaX: number, timestamp: number): -1 | 0 | 1
  reset(): void
}

/**
 * Plain wheels emit many small deltas, so steps need a cumulative distance
 * plus a cooldown; otherwise one flick skips half the ring.
 */
export function createWheelAccumulator(
  options: WheelAccumulatorOptions = {},
): WheelAccumulator {
  const cooldown = options.cooldownMs ?? WHEEL_COOLDOWN_MS
  const minDelta = options.minDelta ?? WHEEL_MIN_DELTA
  const threshold = options.threshold ?? WHEEL_THRESHOLD
  let total = 0
  let lastStepAt = Number.NEGATIVE_INFINITY

  return {
    push(deltaX, timestamp) {
      if (Math.abs(deltaX) < minDelta) return 0
      if (timestamp - lastStepAt < cooldown) return 0
      if (total !== 0 && Math.sign(deltaX) !== Math.sign(total)) total = 0
      total += deltaX
      if (Math.abs(total) < threshold) return 0
      const step = total > 0 ? 1 : -1
      total = 0
      lastStepAt = timestamp
      return step
    },
    reset() {
      total = 0
      lastStepAt = Number.NEGATIVE_INFINITY
    },
  }
}
