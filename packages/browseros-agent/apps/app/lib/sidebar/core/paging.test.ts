import { describe, expect, it } from 'bun:test'
import {
  backgroundFade,
  COMMIT_PROGRESS,
  carouselWindow,
  classifyWheel,
  createWheelAccumulator,
  edgeDirection,
  pageStep,
  pixelsOf,
  positionFor,
  rubberBand,
  shouldCommit,
  swipeDelta,
  velocityOf,
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

describe('classifyWheel', () => {
  it('treats fractional pixel streams as a trackpad', () => {
    expect(classifyWheel({ deltaX: 4.5, deltaY: 0.25, deltaMode: 0 })).toBe(
      'trackpad',
    )
  })

  it('treats whole steps and line units as a notched wheel', () => {
    expect(classifyWheel({ deltaX: 40, deltaY: 0, deltaMode: 0 })).toBe('wheel')
    expect(classifyWheel({ deltaX: 1, deltaY: 0, deltaMode: 1 })).toBe('wheel')
    expect(classifyWheel({ deltaX: 1.5, deltaY: 0, deltaMode: 1 })).toBe(
      'wheel',
    )
  })

  it('leaves vertical-dominant and flat events to the list below', () => {
    expect(classifyWheel({ deltaX: 2.5, deltaY: -9.5, deltaMode: 0 })).toBe(
      'ignore',
    )
    expect(classifyWheel({ deltaX: 0, deltaY: 0, deltaMode: 0 })).toBe('ignore')
  })
})

describe('pixelsOf', () => {
  it('converts line and page deltas onto the pixel ladder', () => {
    expect(pixelsOf(3, 0)).toBe(3)
    expect(pixelsOf(3, 1)).toBe(120)
    expect(pixelsOf(0.5, 2)).toBe(200)
  })
})

describe('swipeDelta', () => {
  it('inverts under natural scrolling', () => {
    expect(swipeDelta(12, false)).toBe(12)
    expect(swipeDelta(12, true)).toBe(-12)
  })
})

describe('velocityOf', () => {
  it('measures px per ms across the retained samples', () => {
    expect(
      velocityOf([
        { x: 0, t: 100 },
        { x: -30, t: 130 },
        { x: -60, t: 160 },
      ]),
    ).toBeCloseTo(-1)
    expect(velocityOf([{ x: 0, t: 0 }])).toBe(0)
    expect(
      velocityOf([
        { x: 0, t: 5 },
        { x: 10, t: 5 },
      ]),
    ).toBe(0)
  })
})

describe('carouselWindow', () => {
  it('mounts the active space and its two neighbours', () => {
    expect(carouselWindow(order, 'b', 0, false)).toEqual([
      { spaceId: 'a', slot: -1 },
      { spaceId: 'b', slot: 0 },
      { spaceId: 'c', slot: 1 },
    ])
  })

  it('wraps the ends only when wrap-around is on', () => {
    expect(carouselWindow(order, 'a', 2, true)).toEqual([
      { spaceId: 'c', slot: 1 },
      { spaceId: 'a', slot: 2 },
      { spaceId: 'b', slot: 3 },
    ])
    expect(carouselWindow(order, 'a', 0, false)).toEqual([
      { spaceId: 'a', slot: 0 },
      { spaceId: 'b', slot: 1 },
    ])
  })

  it('never mounts the same space twice on a two-space ring', () => {
    expect(carouselWindow(['a', 'b'], 'a', 0, true)).toEqual([
      { spaceId: 'a', slot: 0 },
      { spaceId: 'b', slot: 1 },
    ])
    expect(carouselWindow(order, 'missing', 0, true)).toEqual([])
  })
})

describe('pageStep', () => {
  it('takes the short way round when wrapping', () => {
    expect(pageStep(order, 'a', 'c', true)).toBe(-1)
    expect(pageStep(order, 'a', 'c', false)).toBe(2)
    expect(pageStep(order, 'a', 'missing', true)).toBe(0)
  })
})

describe('edgeDirection', () => {
  it('reports the edge a drag is held against', () => {
    expect(edgeDirection(5, 300)).toBe(-1)
    expect(edgeDirection(295, 300)).toBe(1)
    expect(edgeDirection(150, 300)).toBe(0)
    expect(edgeDirection(5, 0)).toBe(0)
  })
})
