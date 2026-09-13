import { type RefObject, useEffect, useRef, useState } from 'react'
import { SWIPE_ANIMATION_MS } from '@/lib/sidebar/core/paging'
import {
  computeTheme,
  type Theme,
  themeGradient,
} from '@/lib/sidebar/core/theme'
import type { ThemeSpec } from '@/lib/sidebar/core/types'

/**
 * The panel paints two stacked background layers. `--sb-fade` is a registered
 * custom property, so the cross-fade is a CSS transition on one number: a
 * switch animates it to 1, a swipe drives it from the drag offset.
 */

const THEME_FADE_MS = SWIPE_ANIMATION_MS

/**
 * @public
 */
export interface Skin {
  theme: Theme
  gradient: string
  noise: number
}

/**
 * @public
 */
export interface ThemeLayers {
  base: Skin
  overlay: Skin
  /** True while the switch cross-fade owns the property. */
  animating: boolean
}

export function skinOf(spec: ThemeSpec): Skin {
  return {
    theme: computeTheme(spec),
    gradient: themeGradient(spec),
    noise: spec.noise,
  }
}

function sameSkin(a: Skin, b: Skin): boolean {
  return a.gradient === b.gradient && a.theme.text === b.theme.text
}

export function useThemeFade(
  ref: RefObject<HTMLElement | null>,
  active: Skin,
  swipeOverlay: Skin | null,
): ThemeLayers {
  const [layers, setLayers] = useState<ThemeLayers>({
    base: active,
    overlay: active,
    animating: false,
  })
  const previous = useRef(active)
  // Only the painted colours may restart the fade: keying on anything else
  // (grain, say) would tear down the pending settle timer mid-animation.
  const key = `${active.gradient}|${active.theme.text}`

  // biome-ignore lint/correctness/useExhaustiveDependencies: `active` is rebuilt every render; its colours are its identity, and re-running per render would restart the fade.
  useEffect(() => {
    const from = previous.current
    previous.current = active
    if (sameSkin(from, active)) return
    const element = ref.current
    setLayers({ base: from, overlay: active, animating: true })
    // A frame has to pass between the layer swap and the target value, or the
    // browser collapses both into one recalc and skips the transition.
    const frame = requestAnimationFrame(() =>
      element?.style.setProperty('--sb-fade', '1'),
    )
    const timer = setTimeout(() => {
      setLayers({ base: active, overlay: active, animating: false })
      element?.style.setProperty('--sb-fade', '0')
    }, THEME_FADE_MS)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [key])

  if (layers.animating) return layers
  return { base: active, overlay: swipeOverlay ?? active, animating: false }
}
