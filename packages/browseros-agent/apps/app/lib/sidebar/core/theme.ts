import type { TabGroupColor, ThemeSpec } from './types'

/**
 * Palette math in OKLab/OKLCh so hue rotation and chroma scaling stay
 * perceptually even. No dependencies: the whole engine is ~120 lines and
 * runs on every swipe frame.
 */

type Rgb = [number, number, number]

/**
 * @public
 */
export interface Theme {
  bg: string
  bgToolbar: string
  accent: string
  text: string
  isDark: boolean
}

const TEXT_LIGHT = '#ffffff'
const TEXT_DARK = '#111111'

/** Approximate sRGB of the 9 Chromium tab group colors. */
const GROUP_COLOR_RGB: Record<TabGroupColor, Rgb> = {
  grey: [95, 99, 104],
  blue: [26, 115, 232],
  red: [217, 48, 37],
  yellow: [249, 171, 0],
  green: [24, 128, 56],
  pink: [212, 0, 119],
  purple: [160, 66, 226],
  cyan: [0, 126, 139],
  orange: [250, 144, 62],
}

/** A space created before themes existed gets one derived from its group color. */
export function themeSpecForColor(color: TabGroupColor): ThemeSpec {
  return {
    keyColors: [{ rgb: GROUP_COLOR_RGB[color], primary: true }],
    wheel: 'analogous',
    intensity: 0.4,
    noise: 0,
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

function srgbToLinear(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(channel: number): number {
  const c =
    channel <= 0.0031308
      ? channel * 12.92
      : 1.055 * channel ** (1 / 2.4) - 0.055
  return Math.round(clamp(c, 0, 1) * 255)
}

interface Oklch {
  l: number
  c: number
  h: number
}

function rgbToOklch([r, g, b]: Rgb): Oklch {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const okL = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const okA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const okB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const hue = (Math.atan2(okB, okA) * 180) / Math.PI
  return {
    l: okL,
    c: Math.hypot(okA, okB),
    h: hue < 0 ? hue + 360 : hue,
  }
}

function oklchToRgb({ l, c, h }: Oklch): Rgb {
  const rad = (h * Math.PI) / 180
  const a = Math.cos(rad) * c
  const b = Math.sin(rad) * c
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    linearToSrgb(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    linearToSrgb(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    linearToSrgb(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  ]
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

function relativeLuminance([r, g, b]: Rgb): number {
  return (
    0.2126 * srgbToLinear(r) +
    0.7152 * srgbToLinear(g) +
    0.0722 * srgbToLinear(b)
  )
}

function contrast(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

const WHITE: Rgb = [255, 255, 255]
const BLACK: Rgb = [17, 17, 17]

/**
 * Derive the four surface colors from a spec. Dark vs light is decided by
 * which text candidate wins on contrast, not by a luminance threshold, so
 * mid-tone accents land on whichever side is actually readable.
 */
export function computeTheme(spec: ThemeSpec): Theme {
  const keys =
    spec.keyColors.length > 0 ? spec.keyColors : [{ rgb: [95, 99, 104] as Rgb }]
  const primary = keys.find((key) => key.primary) ?? keys[0]
  const intensity = clamp(spec.intensity, 0, 1)
  const base = rgbToOklch(primary.rgb)

  const bg: Oklch = {
    l: base.l,
    c: base.c * (0.4 + 0.6 * intensity),
    h: base.h,
  }
  const bgRgb = oklchToRgb(bg)

  const onWhite = contrast(bgRgb, WHITE)
  const onBlack = contrast(bgRgb, BLACK)
  const isDark = onWhite >= onBlack

  const toolbar: Oklch = {
    l: clamp(bg.l + (isDark ? 0.06 : -0.06), 0, 1),
    c: bg.c,
    h: bg.h,
  }

  const secondary = keys.find((key) => key !== primary)
  const shift = spec.wheel === 'complementary' ? 180 : 30
  const accent: Oklch = {
    l: isDark ? 0.78 : 0.48,
    c: Math.max(base.c, 0.12) * (0.6 + 0.4 * intensity),
    h: secondary ? rgbToOklch(secondary.rgb).h : (base.h + shift) % 360,
  }

  return {
    bg: toHex(bgRgb),
    bgToolbar: toHex(oklchToRgb(toolbar)),
    accent: toHex(oklchToRgb(accent)),
    text: isDark ? TEXT_LIGHT : TEXT_DARK,
    isDark,
  }
}

/**
 * The coarse shadow of a theme: Chromium offers exactly 9 group colors, so a
 * space's group takes whichever sits closest to its primary key color.
 * Distance is measured in OKLab, where equal steps look equal.
 */
export function nearestGroupColor(rgb: Rgb): TabGroupColor {
  const target = rgbToOklch(rgb)
  let best: TabGroupColor = 'grey'
  let bestDistance = Number.POSITIVE_INFINITY
  for (const [name, candidate] of Object.entries(GROUP_COLOR_RGB)) {
    const other = rgbToOklch(candidate)
    // Hue only means something once there is chroma to carry it.
    const hueGap = Math.abs(((target.h - other.h + 540) % 360) - 180)
    const chroma = Math.min(target.c, other.c)
    const distance =
      (target.l - other.l) ** 2 * 0.5 +
      (target.c - other.c) ** 2 * 4 +
      ((hueGap / 180) * chroma * 6) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      best = name as TabGroupColor
    }
  }
  return best
}

function rgba(rgb: Rgb, alpha: number): string {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`
}

/**
 * Layered gradient for one space. One key color is a soft wash, two stack two
 * opposed linear layers, three add radial anchors — the same recipe family the
 * design study describes, expressed as a single CSS `background` value.
 */
export function themeGradient(spec: ThemeSpec): string {
  const theme = computeTheme(spec)
  const keys = spec.keyColors.length > 0 ? spec.keyColors : []
  const intensity = clamp(spec.intensity, 0, 1)
  const alpha = 0.25 + 0.55 * intensity
  const layers: string[] = []

  if (keys.length >= 3) {
    layers.push(
      `radial-gradient(120% 90% at 100% 0%, ${rgba(keys[1].rgb, alpha)}, transparent 70%)`,
      `radial-gradient(120% 90% at 0% 0%, ${rgba(keys[2].rgb, alpha)}, transparent 70%)`,
      `linear-gradient(185deg, ${rgba(keys[0].rgb, alpha)}, transparent 75%)`,
    )
  } else if (keys.length === 2) {
    layers.push(
      `linear-gradient(135deg, ${rgba(keys[0].rgb, alpha)}, transparent 70%)`,
      `linear-gradient(-45deg, ${rgba(keys[1].rgb, alpha)}, transparent 70%)`,
    )
  } else if (keys.length === 1) {
    layers.push(
      `linear-gradient(160deg, ${rgba(keys[0].rgb, alpha)}, transparent 80%)`,
    )
  }
  layers.push(theme.bg)
  return layers.join(', ')
}
