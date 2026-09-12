import {
  CAPTURE_INTERVAL_MS,
  captureDownloadPath,
  isCapturableUrl,
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

/** Chrome throttles captureVisibleTab to two calls per second. */
async function captureVisible(windowId: number): Promise<string> {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
      format: 'png',
    })
    if (dataUrl) return dataUrl
  } catch {
    // Retried once below.
  }
  await sleep(CAPTURE_INTERVAL_MS)
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
    format: 'png',
  })
  if (!dataUrl) throw new Error('Chrome returned an empty capture')
  return dataUrl
}

interface LayoutMetrics {
  cssContentSize?: { width: number; height: number }
  contentSize?: { width: number; height: number }
}

async function captureWithDebugger(tab: Tab): Promise<CaptureOutcome> {
  const target = { tabId: tab.id }
  await chrome.debugger.attach(target, DEBUGGER_PROTOCOL)
  try {
    const metrics = (await chrome.debugger.sendCommand(
      target,
      'Page.getLayoutMetrics',
    )) as LayoutMetrics
    const size = metrics.cssContentSize ?? metrics.contentSize
    if (!size) throw new Error('Page.getLayoutMetrics returned no size')
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

async function captureByStitching(tab: Tab): Promise<CaptureOutcome> {
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
      const dataUrl = await captureVisible(tab.windowId)
      lastCapture = Date.now()
      await sendCaptureMessage(CaptureMessageType.addSlice, { dataUrl, y })
    }
    const result = await sendCaptureMessage(CaptureMessageType.finishStitch)
    return { ...result, truncated: plan.truncated, method: 'stitch' }
  } finally {
    await runInTab(tab.id, restorePage).catch(() => undefined)
  }
}

async function captureViewport(tab: Tab): Promise<CaptureOutcome> {
  const dataUrl = await captureVisible(tab.windowId)
  return { dataUrl, copied: false, truncated: false, method: 'viewport' }
}

async function capture(tab: Tab, mode: CaptureMode): Promise<CaptureOutcome> {
  if (mode === 'viewport') return captureViewport(tab)
  if (mode === 'stitch') return captureByStitching(tab)
  try {
    return await captureWithDebugger(tab)
  } catch (error) {
    sentry.captureException(error, {
      extra: { message: 'Debugger capture failed, falling back to stitching' },
    })
    return captureByStitching(tab)
  }
}

export async function capturePage(
  tabId?: number,
  mode: CaptureMode = 'full',
): Promise<CaptureReport> {
  if (running) return { ok: false, error: 'A capture is already running' }
  const tab = await resolveTab(tabId)
  if (!tab || tab.id === undefined || tab.windowId === undefined) {
    return { ok: false, error: 'No tab to capture' }
  }
  if (!isCapturableUrl(tab.url)) {
    notify('Capture unavailable', 'This page cannot be captured.')
    return { ok: false, error: 'This page cannot be captured' }
  }
  const target = tab as Tab

  running = true
  let outcome: CaptureOutcome
  try {
    outcome = await capture(target, mode)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'This page cannot be captured.'
    notify('Capture failed', message)
    return { ok: false, error: message }
  } finally {
    running = false
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
