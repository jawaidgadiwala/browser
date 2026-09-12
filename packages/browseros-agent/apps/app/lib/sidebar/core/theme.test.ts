import { describe, expect, it } from 'bun:test'
import {
  computeTheme,
  nearestGroupColor,
  themeGradient,
  themeSpecForColor,
} from './theme'
import type { ThemeSpec } from './types'

const spec = (
  rgb: [number, number, number],
  patch: Partial<ThemeSpec> = {},
): ThemeSpec => ({
  keyColors: [{ rgb, primary: true }],
  wheel: 'analogous',
  intensity: 0.4,
  noise: 0,
  ...patch,
})

describe('computeTheme', () => {
  it('is deterministic', () => {
    expect(computeTheme(spec([26, 115, 232]))).toEqual(
      computeTheme(spec([26, 115, 232])),
    )
  })

  it('picks the text with the better contrast, not the higher luminance', () => {
    expect(computeTheme(spec([26, 115, 232]))).toMatchObject({
      text: '#ffffff',
      isDark: true,
    })
    expect(computeTheme(spec([249, 171, 0]))).toMatchObject({
      text: '#111111',
      isDark: false,
    })
    expect(computeTheme(spec([255, 255, 255]))).toMatchObject({
      text: '#111111',
      isDark: false,
    })
    expect(computeTheme(spec([0, 0, 0]))).toMatchObject({
      text: '#ffffff',
      isDark: true,
    })
  })

  it('produces stable surfaces for a known color', () => {
    expect(computeTheme(themeSpecForColor('blue'))).toEqual({
      bg: '#4778c1',
      bgToolbar: '#588bd5',
      accent: '#b3a7ff',
      text: '#ffffff',
      isDark: true,
    })
  })

  it('lifts the toolbar on dark themes and drops it on light ones', () => {
    const dark = computeTheme(themeSpecForColor('blue'))
    const light = computeTheme(themeSpecForColor('yellow'))
    expect(dark.bgToolbar > dark.bg).toBe(true)
    expect(light.bgToolbar < light.bg).toBe(true)
  })

  it('moves the accent hue with the wheel', () => {
    const analogous = computeTheme(spec([26, 115, 232]))
    const complementary = computeTheme(
      spec([26, 115, 232], { wheel: 'complementary' }),
    )
    expect(complementary.accent).not.toBe(analogous.accent)
    expect(complementary.bg).toBe(analogous.bg)
  })

  it('takes the accent hue from a second key color when given one', () => {
    const paired = computeTheme({
      keyColors: [
        { rgb: [26, 115, 232], primary: true },
        { rgb: [217, 48, 37] },
      ],
      wheel: 'analogous',
      intensity: 0.4,
      noise: 0,
    })
    expect(paired.accent).not.toBe(computeTheme(spec([26, 115, 232])).accent)
  })

  it('desaturates the background as intensity drops', () => {
    const flat = computeTheme(spec([26, 115, 232], { intensity: 0 }))
    const vivid = computeTheme(spec([26, 115, 232], { intensity: 1 }))
    expect(flat.bg).not.toBe(vivid.bg)
  })

  it('falls back to a neutral key color', () => {
    expect(computeTheme(spec([0, 0, 0], { keyColors: [] })).bg).toBe('#606366')
  })

  it('maps all nine group colors', () => {
    for (const color of [
      'grey',
      'blue',
      'red',
      'yellow',
      'green',
      'pink',
      'purple',
      'cyan',
      'orange',
    ] as const) {
      expect(computeTheme(themeSpecForColor(color)).bg).toMatch(
        /^#[0-9a-f]{6}$/,
      )
    }
  })
})

describe('nearestGroupColor', () => {
  it('maps a key color onto the closest of the nine group colors', () => {
    expect(nearestGroupColor([255, 0, 0])).toBe('red')
    expect(nearestGroupColor([20, 110, 230])).toBe('blue')
    expect(nearestGroupColor([30, 200, 90])).toBe('green')
    expect(nearestGroupColor([150, 60, 220])).toBe('purple')
    expect(nearestGroupColor([120, 120, 120])).toBe('grey')
  })

  it('returns an exact group color unchanged', () => {
    expect(nearestGroupColor([249, 171, 0])).toBe('yellow')
    expect(nearestGroupColor([0, 126, 139])).toBe('cyan')
  })
})

describe('themeGradient', () => {
  it('layers one gradient per key color over the base', () => {
    const one = themeGradient({
      keyColors: [{ rgb: [40, 80, 200], primary: true }],
      wheel: 'analogous',
      intensity: 0.5,
      noise: 0,
    })
    expect(one.split('linear-gradient').length - 1).toBe(1)

    const three = themeGradient({
      keyColors: [
        { rgb: [40, 80, 200], primary: true },
        { rgb: [200, 40, 80] },
        { rgb: [80, 200, 40] },
      ],
      wheel: 'complementary',
      intensity: 1,
      noise: 0,
    })
    expect(three.split('radial-gradient').length - 1).toBe(2)
  })

  it('falls back to the flat background when there is no key color', () => {
    const spec = {
      keyColors: [],
      wheel: 'analogous' as const,
      intensity: 0.4,
      noise: 0,
    }
    expect(themeGradient(spec)).toBe(computeTheme(spec).bg)
  })
})
