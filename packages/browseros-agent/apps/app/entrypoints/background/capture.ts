import {
  CAPTURE_BUSY_ERROR,
  CAPTURE_INTERVAL_MS,
  CAPTURE_TAB_CHANGED_ERROR,
  captureDownloadPath,
  invalidatesCapture,
  isCapturableUrl,
  isCaptureTargetActive,
  MAX_CAPTURE_CSS_PX,
  maxCaptureHeight,
  planSlices,
} from '@/lib/capture/capture.helpers'
import { showCaptureOverlay } from '@/lib/capture/capture-overlay'
import {
  preparePage,
  restorePage,
  scrollPageTo,
} from '@/lib/capture/capture-page-scripts'
import {
  CaptureMessageType,
  type CaptureMode,
  type CaptureReport,
  onCaptureMessage,
  sendCaptureMessage,
} from '@/lib/messaging/capture/captureMessages'
import { sentry } from '@/lib/sentry/sentry'

/**
 * Full-page capture (Cmd+Shift+2). Full-page captures attach the
 * debugger and let Chromium render beyond the viewport, the same primitive
 * some browsers use natively. If the debugger is unavailable (DevTools open
 * on the tab, another debugger attached) the tab is scrolled one viewport
 * at a time and the slices are stitched in the offscreen document, which
 * also owns the clipboard.
 */

const CAPTURE_COMMAND = 'capture-page'
const OFFSCREEN_URL = 'offscreen.html'
const NOTIFICATION_ICON = 'icon/128.png'
const DEBUGGER_PROTOCOL = '1.3'

type Tab = chrome.tabs.Tab & { id: number; windowId: number }

interface CaptureOutcome {
  dataUrl: string
  copied: boolean
  truncated: boolean
  method: CaptureMode
}

let running = false

function notify(title: string, message: string) {
  chrome.notifications?.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL(NOTIFICATION_ICON),
    title,
    message,
  })
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  })
  if (contexts.length > 0) return
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.CLIPBOARD, chrome.offscreen.Reason.BLOBS],
    justification: 'Stitch page captures and copy them to the clipboard',
  })
}

async function runInTab<Args extends unknown[], Result>(
  tabId: number,
  func: (...args: Args) => Result | Promise<Result>,
  ...args: Args
): Promise<Result> {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args,
  })
  return injection?.result as Result
}

async function resolveTab(tabId?: number): Promise<chrome.tabs.Tab | null> {
  if (tabId !== undefined) {
    return chrome.tabs.get(tabId).catch(() => null)
  }
  const window = await chrome.windows
    .getLastFocused({ windowTypes: ['normal'] })
    .catch(() => null)
  if (window?.id === undefined) return null
  const [active] = await chrome.tabs.query({
    active: true,
    windowId: window.id,
  })
  return active ?? null
}

/**
 * A capture only belongs to the tab it was scrolled in while that tab is still
 * active in its window; otherwise we would silently shoot a stranger.
 * `captureVisibleTab` takes a window, not a tab, so every attempt has to be
 * fenced by `assertValid` on both sides.
 */
interface CaptureGuard {
  assertValid(): Promise<void>
  dispose(): void
}

function watchCaptureTarget(target: {
  tabId: number
  windowId: number
}): CaptureGuard {
  let interrupted = false
  const latch = (event: Parameters<typeof invalidatesCapture>[1]) => {
    if (invalidatesCapture(target, event)) interrupted = true
  }
  const onActivated = (info: chrome.tabs.OnActivatedInfo) =>
    latch({ kind: 'activated', tabId: info.tabId, windowId: info.windowId })
  const onRemoved = (tabId: number) => latch({ kind: 'removed', tabId })
  const onUpdated = (tabId: number, changes: chrome.tabs.OnUpdatedInfo) =>
    latch({ kind: 'navigated', tabId, url: changes.url })

  chrome.tabs.onActivated.addListener(onActivated)
  chrome.tabs.onRemoved.addListener(onRemoved)
  chrome.tabs.onUpdated.addListener(onUpdated)

  return {
    async assertValid() {
      if (interrupted) throw new Error(CAPTURE_TAB_CHANGED_ERROR)
      const live = await chrome.tabs.get(target.tabId).catch(() => null)
      if (!isCaptureTargetActive(target, live)) {
        throw new Error(CAPTURE_TAB_CHANGED_ERROR)
      }
      if (interrupted) throw new Error(CAPTURE_TAB_CHANGED_ERROR)
    },
    dispose() {
      chrome.tabs.onActivated.removeListener(onActivated)
      chrome.tabs.onRemoved.removeListener(onRemoved)
      chrome.tabs.onUpdated.removeListener(onUpdated)
    },
  }
}

/** Chrome throttles captureVisibleTab to two calls per second. */
async function captureVisible(tab: Tab, guard: CaptureGuard): Promise<string> {
  await guard.assertValid()
  let dataUrl: string | undefined
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
    })
  } catch {
    // Retried once below.
  }
  if (!dataUrl) {
    await sleep(CAPTURE_INTERVAL_MS)
    await guard.assertValid()
    dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
    })
  }
  if (!dataUrl) throw new Error('Chrome returned an empty capture')
  // The switch can land while the capture is in flight, so the bitmap is only
  // ours if the target is still active now.
  await guard.assertValid()
  return dataUrl
}

interface LayoutMetrics {
  cssContentSize?: { width: number; height: number }
  contentSize?: { width: number; height: number }
}

async function captureWithDebugger(
  tab: Tab,
  guard: CaptureGuard,
): Promise<CaptureOutcome> {
  const target = { tabId: tab.id }
  await chrome.debugger.attach(target, DEBUGGER_PROTOCOL)
  try {
    const metrics = (await chrome.debugger.sendCommand(
      target,
      'Page.getLayoutMetrics',
    )) as LayoutMetrics
    const size = metrics.cssContentSize ?? metrics.contentSize
    if (!size) throw new Error('Page.getLayoutMetrics returned no size')
    await guard.assertValid()
    const height = Math.min(Math.ceil(size.height), MAX_CAPTURE_CSS_PX)
    const shot = (await chrome.debugger.sendCommand(
      target,
      'Page.captureScreenshot',
      {
        format: 'png',
        captureBeyondViewport: true,
        fromSurface: true,
        clip: { x: 0, y: 0, width: Math.ceil(size.width), height, scale: 1 },
      },
    )) as { data?: string }
    if (!shot.data) throw new Error('Page.captureScreenshot returned no data')
    await guard.assertValid()
    return {
      dataUrl: `data:image/png;base64,${shot.data}`,
      copied: false,
      truncated: size.height > height,
      method: 'full',
    }
  } finally {
    await chrome.debugger.detach(target).catch(() => undefined)
  }
}

async function captureByStitching(
  tab: Tab,
  guard: CaptureGuard,
): Promise<CaptureOutcome> {
  const metrics = await runInTab(tab.id, preparePage)
  try {
    const plan = planSlices(
      metrics.scrollHeight,
      metrics.stepHeight,
      maxCaptureHeight(metrics.innerWidth, metrics.devicePixelRatio),
    )
    await ensureOffscreen()
    await sendCaptureMessage(CaptureMessageType.beginStitch, {
      width: metrics.innerWidth,
      height: plan.height,
      cropTop: metrics.cropTop,
    })
    let lastCapture = 0
    let previousY = Number.NEGATIVE_INFINITY
    for (const [index, offset] of plan.offsets.entries()) {
      // Browsers clamp the last offset to a fractional maximum, so only a
      // scroller that fails to advance at all counts as broken.
      const y = await runInTab(tab.id, scrollPageTo, offset, index > 0)
      if (!Number.isFinite(y) || (index > 0 && y <= previousY)) {
        throw new Error('The page did not scroll; try the viewport capture')
      }
      previousY = y
      const wait = lastCapture + CAPTURE_INTERVAL_MS - Date.now()
      if (wait > 0) await sleep(wait)
      const dataUrl = await captureVisible(tab, guard)
      lastCapture = Date.now()
      await sendCaptureMessage(CaptureMessageType.addSlice, { dataUrl, y })
    }
    const result = await sendCaptureMessage(CaptureMessageType.finishStitch)
    return { ...result, truncated: plan.truncated, method: 'stitch' }
  } finally {
    await runInTab(tab.id, restorePage).catch(() => undefined)
  }
}

async function captureViewport(
  tab: Tab,
  guard: CaptureGuard,
): Promise<CaptureOutcome> {
  const dataUrl = await captureVisible(tab, guard)
  return { dataUrl, copied: false, truncated: false, method: 'viewport' }
}

async function capture(
  tab: Tab,
  mode: CaptureMode,
  guard: CaptureGuard,
): Promise<CaptureOutcome> {
  if (mode === 'viewport') return captureViewport(tab, guard)
  if (mode === 'stitch') return captureByStitching(tab, guard)
  try {
    return await captureWithDebugger(tab, guard)
  } catch (error) {
    if (error instanceof Error && error.message === CAPTURE_TAB_CHANGED_ERROR) {
      throw error
    }
    sentry.captureException(error, {
      extra: { message: 'Debugger capture failed, falling back to stitching' },
    })
    return captureByStitching(tab, guard)
  }
}

/**
 * The busy flag is taken synchronously: two commands arriving in one turn would
 * otherwise both pass the check while resolving their tab, and then share the
 * one offscreen stitching canvas. It is held until the download and the
 * clipboard copy are done, because those read the same outcome.
 */
export async function capturePage(
  tabId?: number,
  mode: CaptureMode = 'full',
): Promise<CaptureReport> {
  if (running) return { ok: false, error: CAPTURE_BUSY_ERROR }
  running = true
  try {
    return await runCapture(tabId, mode)
  } finally {
    running = false
  }
}

async function runCapture(
  tabId: number | undefined,
  mode: CaptureMode,
): Promise<CaptureReport> {
  const tab = await resolveTab(tabId)
  if (!tab || tab.id === undefined || tab.windowId === undefined) {
    return { ok: false, error: 'No tab to capture' }
  }
  if (!isCapturableUrl(tab.url)) {
    notify('Capture unavailable', 'This page cannot be captured.')
    return { ok: false, error: 'This page cannot be captured' }
  }
  const target = tab as Tab

  const guard = watchCaptureTarget({
    tabId: target.id,
    windowId: target.windowId,
  })
  let outcome: CaptureOutcome
  try {
    outcome = await capture(target, mode, guard)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'This page cannot be captured.'
    notify('Capture failed', message)
    return { ok: false, error: message }
  } finally {
    guard.dispose()
  }

  const download = chrome.downloads
    .download({
      url: outcome.dataUrl,
      filename: captureDownloadPath(new Date()),
      conflictAction: 'uniquify',
      saveAs: false,
    })
    .catch((error: unknown) => {
      sentry.captureException(error, {
        extra: { message: 'Capture download failed' },
      })
    })

  const title =
    outcome.method === 'viewport' ? 'Page captured' : 'Full page captured'
  let copied = outcome.copied
  try {
    // The focused page can write the clipboard (clipboardWrite permission);
    // the offscreen document usually cannot because it is never focused.
    const result = await runInTab(target.id, showCaptureOverlay, {
      dataUrl: outcome.dataUrl,
      title,
      truncated: outcome.truncated,
      copy: !copied,
    })
    copied = copied || result?.copied === true
  } catch {
    copied =
      copied ||
      (await ensureOffscreen()
        .then(() =>
          sendCaptureMessage(CaptureMessageType.copyImage, {
            dataUrl: outcome.dataUrl,
          }),
        )
        .catch(() => false))
    notify(
      title,
      `${copied ? 'Copied and saved' : 'Saved to Downloads'}${
        outcome.truncated ? ' · truncated' : ''
      }`,
    )
  }
  await download
  return {
    ok: true,
    method: outcome.method,
    copied,
    truncated: outcome.truncated,
  }
}

export function registerCapture() {
  chrome.commands?.onCommand.addListener((command, tab) => {
    if (command !== CAPTURE_COMMAND) return
    void capturePage(tab?.id).catch((error) => {
      sentry.captureException(error, { extra: { message: 'Capture failed' } })
    })
  })
  onCaptureMessage(CaptureMessageType.now, ({ data }) =>
    capturePage(data?.tabId, data?.mode),
  )
}
