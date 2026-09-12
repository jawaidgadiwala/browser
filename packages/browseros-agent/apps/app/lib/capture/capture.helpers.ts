import dayjs from 'dayjs'

export const CAPTURE_FOLDER = 'BrowserOS Captures'

/** Only pages the extension can capture and script after an activeTab grant. */
export function isCapturableUrl(url: string | undefined): boolean {
  if (!url) return false
  return /^(https?|file):/.test(url)
}

/** Arc-style name: `BrowserOS Capture 2026-09-12 at 14.03.05.png`. */
export function captureFilename(date: Date): string {
  return `BrowserOS Capture ${dayjs(date).format('YYYY-MM-DD [at] HH.mm.ss')}.png`
}

export function captureDownloadPath(date: Date): string {
  return `${CAPTURE_FOLDER}/${captureFilename(date)}`
}

/** Chrome enforces MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND = 2. */
export const CAPTURE_INTERVAL_MS = 550
/** Chrome caps canvases at 32767 device pixels per side and ~268M pixels. */
const MAX_CANVAS_SIDE_PX = 32000
const MAX_CANVAS_AREA_PX = 260_000_000
export const MAX_CAPTURE_CSS_PX = 20000

/** Tallest page (CSS px) whose composed bitmap still fits in one canvas. */
export function maxCaptureHeight(widthCss: number, scale: number): number {
  const s = Math.max(scale, 1)
  const bySide = MAX_CANVAS_SIDE_PX / s
  const byArea = MAX_CANVAS_AREA_PX / (Math.max(widthCss, 1) * s * s)
  return Math.floor(Math.min(MAX_CAPTURE_CSS_PX, bySide, byArea))
}

export interface SlicePlan {
  offsets: number[]
  height: number
  truncated: boolean
}

/**
 * Viewport-sized slices covering the page top to bottom. The last offset is
 * pulled up so the final slice ends exactly at the page bottom.
 */
export function planSlices(
  scrollHeight: number,
  viewportHeight: number,
  maxHeight: number,
): SlicePlan {
  const truncated = scrollHeight > maxHeight
  const height = Math.max(1, Math.min(scrollHeight, maxHeight))
  const step = Math.max(1, Math.floor(viewportHeight))
  const offsets: number[] = []
  for (let y = 0; y + step < height; y += step) offsets.push(y)
  offsets.push(Math.max(0, height - step))
  return { offsets, height, truncated }
}
