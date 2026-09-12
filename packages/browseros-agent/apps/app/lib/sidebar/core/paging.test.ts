import { describe, expect, it } from 'bun:test'
import {
  backgroundFade,
  COMMIT_PROGRESS,
  createWheelAccumulator,
  positionFor,
  rubberBand,
  shouldCommit,
  WHEEL_COOLDOWN_MS,
} from './paging'

const order = ['a', 'b', 'c']

describe('positionFor', () => {
  it('reports the pair being crossed and the progress between them', () => {
    expect(positionFor(order, 'a', 0, 300)).toEqual({
      floorId: 'a',
      ceilId: 'a',
      progress: 0,
    })
    expect(positionFor(order, 'a', -150, 300)).toEqual({
      floorId: 'a',
      ceilId: 'b',
      progress: 0.5,
    })
    expect(positionFor(order, 'b', 75, 300)).toEqual({
      floorId: 'a',
      ceilId: 'b',
      progress: 0.75,
    })
  })

  it('clamps progress at a full width', () => {
    expect(positionFor(order, 'a', -900, 300).progress).toBe(1)
  })

  it('holds at the edges unless wrapping is on', () => {
    expect(positionFor(order, 'a', 100, 300)).toEqual({
      floorId: 'a',
      ceilId: 'a',
      progress: 0,
    })
    expect(positionFor(order, 'a', 100, 300, true)).toMatchObject({
      floorId: 'c',
      ceilId: 'a',
    })
  })

  it('degrades safely on an unknown space or zero width', () => {
    expect(positionFor(order, 'zz', -50, 300).floorId).toBeNull()
    expect(positionFor(order, 'a', -50, 0).progress).toBe(0)
  })
})

describe('rubberBand', () => {
  it('is odd, monotonic and bounded', () => {
    const width = 200
    expect(rubberBand(0, width)).toBe(0)
    expect(rubberBand(-50, width)).toBe(-rubberBand(50, width))

    let previous = 0
    for (let x = 1; x < 20000; x += 37) {
      const value = rubberBand(x, width)
      expect(value).toBeGreaterThan(previous)
      expect(value).toBeLessThanOrEqual(4.5 * width)
      expect(value).toBeLessThanOrEqual(x)
      previous = value
    }
  })

  it('softens gently near zero', () => {
    const width = 200
    expect(rubberBand(10, width) / 10).toBeGreaterThan(0.98)
    expect(rubberBand(900, width) / 900).toBeLessThanOrEqual(0.5)
    expect(rubberBand(10, 0)).toBe(0)
  })
})

describe('backgroundFade', () => {
  it('runs from 1 to 0 over 200 px', () => {
    expect(backgroundFade(0)).toBe(1)
    expect(backgroundFade(100)).toBe(0.5)
    expect(backgroundFade(-100)).toBe(0.5)
    expect(backgroundFade(500)).toBe(0)
  })
})

describe('shouldCommit', () => {
  it('commits past the distance threshold or on a flick', () => {
    expect(shouldCommit({ progress: COMMIT_PROGRESS, velocity: 0 })).toBe(true)
    expect(shouldCommit({ progress: 0.34, velocity: 0 })).toBe(false)
    expect(shouldCommit({ progress: 0.1, velocity: 0.51 })).toBe(true)
    expect(shouldCommit({ progress: 0.1, velocity: -0.51 })).toBe(true)
    expect(shouldCommit({ progress: 0.1, velocity: 0.5 })).toBe(false)
  })
})

describe('createWheelAccumulator', () => {
  it('needs the cumulative threshold before stepping', () => {
    const wheel = createWheelAccumulator({ threshold: 30 })
    expect(wheel.push(10, 0)).toBe(0)
    expect(wheel.push(10, 10)).toBe(0)
    expect(wheel.push(10, 20)).toBe(1)
  })

  it('ignores sub-pixel noise', () => {
    const wheel = createWheelAccumulator({ threshold: 2 })
    expect(wheel.push(0.5, 0)).toBe(0)
    expect(wheel.push(0.9, 10)).toBe(0)
    expect(wheel.push(3, 20)).toBe(1)
  })

  it('holds a cooldown after a step', () => {
    const wheel = createWheelAccumulator({ threshold: 10 })
    expect(wheel.push(20, 0)).toBe(1)
    expect(wheel.push(20, WHEEL_COOLDOWN_MS - 1)).toBe(0)
    expect(wheel.push(20, WHEEL_COOLDOWN_MS)).toBe(1)
  })

  it('drops the accumulator when the direction flips, and resets', () => {
    const wheel = createWheelAccumulator({ threshold: 30, cooldownMs: 0 })
    expect(wheel.push(20, 0)).toBe(0)
    expect(wheel.push(-20, 1)).toBe(0)
    expect(wheel.push(-20, 2)).toBe(-1)

    wheel.reset()
    expect(wheel.push(20, 3)).toBe(0)
    wheel.reset()
    expect(wheel.push(20, 4)).toBe(0)
  })
})
