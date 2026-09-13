import { ringDelta } from './selectors'
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
const COMMIT_VELOCITY = 0.5

export const WHEEL_COOLDOWN_MS = 200
const WHEEL_MIN_DELTA = 1
const WHEEL_THRESHOLD = 30

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

/** Chromium emits no gesture-end event: a quiet stream is the end of it. */
export const SWIPE_IDLE_MS = 80

/** Page animation, and the extra wait before the watchdog snaps it. */
export const SWIPE_ANIMATION_MS = 250
export const SWIPE_WATCHDOG_MS = 50

/** Cumulative distance a notched wheel must travel to step one space. */
export const WHEEL_DISTANCE_THRESHOLD = 120

/** Drag-to-edge space switching. */
const EDGE_ZONE_PX = 20
export const EDGE_HOLD_MS = 500

/**
 * @public
 */
export type WheelKind = 'trackpad' | 'wheel' | 'ignore'

/**
 * @public
 */
export interface WheelSample {
  deltaX: number
  deltaY: number
  deltaMode: number
}

/**
 * Trackpads stream fractional pixel deltas; notched wheels send whole steps,
 * often in line or page units. The two need different physics, and a
 * vertical-dominant event belongs to the list underneath, not to the carousel.
 */
export function classifyWheel(sample: WheelSample): WheelKind {
  if (Math.abs(sample.deltaY) > Math.abs(sample.deltaX)) return 'ignore'
  if (sample.deltaX === 0) return 'ignore'
  if (sample.deltaMode !== 0) return 'wheel'
  return Number.isInteger(sample.deltaX) && Number.isInteger(sample.deltaY)
    ? 'wheel'
    : 'trackpad'
}

/** Chromium reports notched wheels in lines or pages; the ladder is in px. */
const LINE_PX = 40
const PAGE_PX = 400

export function pixelsOf(delta: number, deltaMode: number): number {
  if (deltaMode === 1) return delta * LINE_PX
  if (deltaMode === 2) return delta * PAGE_PX
  return delta
}

/** Natural scrolling flips which way the content follows the fingers. */
export function swipeDelta(deltaX: number, naturalScroll: boolean): number {
  return naturalScroll ? -deltaX : deltaX
}

/**
 * @public
 */
export interface VelocitySample {
  x: number
  t: number
}

/** px/ms across the retained samples; zero when they share a timestamp. */
export function velocityOf(samples: VelocitySample[]): number {
  if (samples.length < 2) return 0
  const first = samples[0]
  const last = samples[samples.length - 1]
  const span = last.t - first.t
  return span <= 0 ? 0 : (last.x - first.x) / span
}

/**
 * @public
 */
export interface CarouselSlot {
  spaceId: SpaceId
  /** Track position in whole panel widths; the active space sits at `page`. */
  slot: number
}

/**
 * The mounted window: the active space and its two ring neighbours, never
 * more. Without wrap the ends simply have fewer neighbours.
 */
export function carouselWindow(
  order: SpaceId[],
  activeId: SpaceId | null,
  page: number,
  wrap: boolean,
): CarouselSlot[] {
  const index = order.indexOf(activeId ?? '')
  if (index === -1) return []
  const slots: CarouselSlot[] = []
  for (const offset of [-1, 0, 1]) {
    let neighbour = index + offset
    if (neighbour < 0 || neighbour >= order.length) {
      if (!wrap || order.length < 3) continue
      neighbour = (neighbour + order.length) % order.length
    }
    const spaceId = order[neighbour]
    if (slots.some((slot) => slot.spaceId === spaceId)) continue
    slots.push({ spaceId, slot: page + offset })
  }
  return slots
}

/** How far the track moves for a switch, in whole panel widths. */
export function pageStep(
  order: SpaceId[],
  fromId: SpaceId | null,
  toId: SpaceId | null,
  wrap: boolean,
): number {
  const from = order.indexOf(fromId ?? '')
  const to = order.indexOf(toId ?? '')
  if (from === -1 || to === -1) return 0
  return wrap ? ringDelta(from, to, order.length) : to - from
}

/** Which edge a drag is hovering, for drag-to-edge switching. */
export function edgeDirection(
  clientX: number,
  width: number,
  zone = EDGE_ZONE_PX,
): -1 | 0 | 1 {
  if (width <= 0) return 0
  if (clientX <= zone) return -1
  if (clientX >= width - zone) return 1
  return 0
}
