/**
 * Functions injected into the captured tab via chrome.scripting. Each must
 * stay self-contained (no imports, no closures) because Chrome serialises
 * them with Function.toString().
 */

export interface PageMetrics {
  /** Total scrollable height of the element that actually scrolls. */
  scrollHeight: number
  /** Window viewport, which is what captureVisibleTab returns. */
  innerHeight: number
  innerWidth: number
  /** Viewport rows occupied by the scroller (equals innerHeight for the document). */
  stepHeight: number
  /** Window y where the scroller's content starts; non-zero for inner scrollers. */
  cropTop: number
  devicePixelRatio: number
  scroller: 'document' | 'element'
}

interface CaptureState {
  scroller: Element
  scrollTop: number
  style: HTMLStyleElement
  frozen: Array<{ element: HTMLElement; cssText: string }>
}

// Injected functions cannot see module scope, so the state key is spelled
// out in each of them instead of shared as a constant.
type CaptureWindow = Window & { __browserosCapture?: CaptureState }

/**
 * Finds the real scroll container (window, or the tallest overflow element
 * on smooth-scroll sites), hides scrollbars and remembers the scroll offset.
 */
export function preparePage(): PageMetrics {
  const win = window as CaptureWindow
  document.getElementById('browseros-capture-overlay')?.remove()
  const root = document.scrollingElement ?? document.documentElement
  let scroller: Element = root
  if (root.scrollHeight <= root.clientHeight + 1) {
    let best = 0
    for (const element of document.querySelectorAll('body, body *')) {
      const overflow = getComputedStyle(element).overflowY
      if (overflow !== 'auto' && overflow !== 'scroll') continue
      const extra = element.scrollHeight - element.clientHeight
      if (extra > best && element.clientHeight >= window.innerHeight / 2) {
        best = extra
        scroller = element
      }
    }
  }
  const style = document.createElement('style')
  style.textContent =
    'html,body{scrollbar-width:none!important;scroll-behavior:auto!important}' +
    '::-webkit-scrollbar{display:none!important}'
  document.documentElement.appendChild(style)
  if (!win.__browserosCapture) {
    win.__browserosCapture = {
      scroller,
      scrollTop: scroller === root ? window.scrollY : scroller.scrollTop,
      style,
      frozen: [],
    }
  }
  const isDocument = scroller === root
  const rect = isDocument ? null : scroller.getBoundingClientRect()
  return {
    scrollHeight: scroller.scrollHeight,
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
    stepHeight: isDocument ? window.innerHeight : scroller.clientHeight,
    cropTop: rect ? Math.max(0, Math.round(rect.top)) : 0,
    devicePixelRatio: window.devicePixelRatio || 1,
    scroller: isDocument ? 'document' : 'element',
  }
}

/**
 * Jumps to `y` (bypassing smooth scrolling) and, after the first slice, pins
 * fixed/sticky elements so headers and cookie bars appear once. Resolves with
 * the offset actually reached once the page has painted.
 */
export function scrollPageTo(y: number, freeze: boolean): Promise<number> {
  const win = window as CaptureWindow
  const state = win.__browserosCapture
  if (!state) return Promise.resolve(Number.NaN)
  if (freeze && state.frozen.length === 0) {
    for (const element of document.querySelectorAll<HTMLElement>('body *')) {
      const position = getComputedStyle(element).position
      if (position !== 'fixed' && position !== 'sticky') continue
      state.frozen.push({ element, cssText: element.style.cssText })
      if (position === 'fixed') {
        element.style.setProperty('visibility', 'hidden', 'important')
      } else {
        element.style.setProperty('position', 'static', 'important')
      }
    }
  }
  const root = document.scrollingElement ?? document.documentElement
  const isDocument = state.scroller === root
  if (isDocument) window.scrollTo({ top: y, left: 0, behavior: 'instant' })
  else state.scroller.scrollTo({ top: y, behavior: 'instant' })
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          resolve(isDocument ? window.scrollY : state.scroller.scrollTop)
        }, 250)
      })
    })
  })
}

export function restorePage(): void {
  const win = window as CaptureWindow
  const state = win.__browserosCapture
  if (!state) return
  for (const { element, cssText } of state.frozen) {
    element.style.cssText = cssText
  }
  state.style.remove()
  const root = document.scrollingElement ?? document.documentElement
  if (state.scroller === root) {
    window.scrollTo({ top: state.scrollTop, behavior: 'instant' })
  } else {
    state.scroller.scrollTo({ top: state.scrollTop, behavior: 'instant' })
  }
  delete win.__browserosCapture
}
