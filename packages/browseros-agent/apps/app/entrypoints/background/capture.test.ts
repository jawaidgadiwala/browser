import { beforeEach, describe, expect, it, mock } from 'bun:test'
import {
  CAPTURE_BUSY_ERROR,
  CAPTURE_TAB_CHANGED_ERROR,
} from '@/lib/capture/capture.helpers'
import type { PageMetrics } from '@/lib/capture/capture-page-scripts'
import {
  preparePage,
  restorePage,
  scrollPageTo,
} from '@/lib/capture/capture-page-scripts'

/**
 * The capture orchestration against a fake `chrome`. These assert ordering and
 * ownership — which tab a bitmap belongs to, and that one operation runs at a
 * time — rather than the predicates in `capture.helpers.test.ts`.
 */

const DATA_URL = 'data:image/png;base64,AAAA'
const TARGET = 1
const STRANGER = 2

interface FakeTab {
  id: number
  windowId: number
  url: string
}

interface Listeners {
  activated: Array<(info: { tabId: number; windowId: number }) => void>
  removed: Array<(tabId: number) => void>
  updated: Array<(tabId: number, changes: { url?: string }) => void>
}

interface World {
  tabs: FakeTab[]
  activeTabId: number
  /** Resolved before every `tabs.get`, to interleave two capture requests. */
  gate: Promise<void>
  captureCalls: number[]
  /** Per-attempt behavior; the default returns a PNG. */
  onCapture?: (attempt: number) => Promise<string>
  metrics: PageMetrics
  scripted: string[]
  downloads: number
  notifications: string[]
  stitch: Array<{ type: string; data?: unknown }>
  overlayCopied: boolean
  listeners: Listeners
}

let world: World

const messageTypes = {
  now: 'capture.now',
  copyImage: 'capture.copyImage',
  beginStitch: 'capture.beginStitch',
  addSlice: 'capture.addSlice',
  finishStitch: 'capture.finishStitch',
} as const

mock.module('@/lib/sentry/sentry', () => ({
  sentry: { captureException: () => undefined },
}))

mock.module('@/lib/messaging/capture/captureMessages', () => ({
  CaptureMessageType: messageTypes,
  onCaptureMessage: () => undefined,
  sendCaptureMessage: async (type: string, data?: unknown) => {
    world.stitch.push({ type, data })
    if (type === messageTypes.finishStitch) {
      return { dataUrl: DATA_URL, copied: true }
    }
    return undefined
  },
}))

function freshWorld(): World {
  return {
    tabs: [
      { id: TARGET, windowId: 10, url: 'https://example.com/' },
      { id: STRANGER, windowId: 10, url: 'https://other.example/' },
    ],
    activeTabId: TARGET,
    gate: Promise.resolve(),
    captureCalls: [],
    metrics: {
      scrollHeight: 2000,
      innerHeight: 1000,
      innerWidth: 800,
      stepHeight: 1000,
      cropTop: 0,
      devicePixelRatio: 1,
      scroller: 'document',
    },
    scripted: [],
    downloads: 0,
    notifications: [],
    stitch: [],
    overlayCopied: true,
    listeners: { activated: [], removed: [], updated: [] },
  }
}

const fire = {
  activated(tabId: number, windowId = 10) {
    for (const listener of world.listeners.activated) {
      listener({ tabId, windowId })
    }
  },
  removed(tabId: number) {
    for (const listener of world.listeners.removed) listener(tabId)
  },
  navigated(tabId: number, url: string) {
    for (const listener of world.listeners.updated) listener(tabId, { url })
  },
}

function listenerPort(bucket: Array<(...args: never[]) => void>) {
  return {
    addListener: (listener: (...args: never[]) => void) => {
      bucket.push(listener)
    },
    removeListener: (listener: (...args: never[]) => void) => {
      const index = bucket.indexOf(listener)
      if (index >= 0) bucket.splice(index, 1)
    },
  }
}

function installChrome() {
  const fake = {
    runtime: {
      id: 'test',
      getURL: (path: string) => `chrome-extension://test/${path}`,
      getContexts: async () => [{}],
      ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
    },
    offscreen: {
      createDocument: async () => undefined,
      Reason: { CLIPBOARD: 'CLIPBOARD', BLOBS: 'BLOBS' },
    },
    notifications: {
      create: (options: { title: string }) => {
        world.notifications.push(options.title)
      },
    },
    downloads: {
      download: async () => {
        world.downloads += 1
        return 1
      },
    },
    commands: { onCommand: listenerPort([]) },
    debugger: {
      attach: async () => {
        throw new Error('debugger unavailable')
      },
      sendCommand: async () => ({}),
      detach: async () => undefined,
    },
    windows: {
      getLastFocused: async () => ({ id: 10 }),
    },
    scripting: {
      executeScript: async ({
        func,
      }: {
        func: (...args: never[]) => unknown
      }) => {
        if (func === preparePage) {
          world.scripted.push('prepare')
          return [{ result: world.metrics }]
        }
        if (func === scrollPageTo) {
          world.scripted.push('scroll')
          const index = world.scripted.filter((n) => n === 'scroll').length - 1
          return [{ result: index * world.metrics.stepHeight }]
        }
        if (func === restorePage) {
          world.scripted.push('restore')
          return [{ result: undefined }]
        }
        world.scripted.push('overlay')
        return [{ result: { copied: world.overlayCopied } }]
      },
    },
    tabs: {
      onActivated: listenerPort(
        world.listeners.activated as Array<(...args: never[]) => void>,
      ),
      onRemoved: listenerPort(
        world.listeners.removed as Array<(...args: never[]) => void>,
      ),
      onUpdated: listenerPort(
        world.listeners.updated as Array<(...args: never[]) => void>,
      ),
      get: async (tabId: number) => {
        await world.gate
        const tab = world.tabs.find((candidate) => candidate.id === tabId)
        if (!tab) throw new Error('No tab with id')
        return { ...tab, active: world.activeTabId === tab.id }
      },
      query: async () => [
        { ...world.tabs[0], active: world.activeTabId === TARGET },
      ],
      captureVisibleTab: async (windowId: number) => {
        world.captureCalls.push(windowId)
        if (world.onCapture) return world.onCapture(world.captureCalls.length)
        return DATA_URL
      },
    },
  }
  ;(globalThis as unknown as { chrome: unknown }).chrome = fake
}

world = freshWorld()
installChrome()

const { capturePage } = await import('./capture')

beforeEach(() => {
  world = freshWorld()
  installChrome()
})

function deferred() {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('capture target ownership', () => {
  it('captures a stable active tab and saves it once', async () => {
    const report = await capturePage(TARGET, 'viewport')

    expect(report).toEqual({
      ok: true,
      method: 'viewport',
      copied: true,
      truncated: false,
    })
    expect(world.captureCalls).toEqual([10])
    expect(world.downloads).toBe(1)
  })

  it('refuses an explicit target that is not the active tab', async () => {
    world.activeTabId = STRANGER

    const report = await capturePage(TARGET, 'viewport')

    expect(report).toEqual({ ok: false, error: CAPTURE_TAB_CHANGED_ERROR })
    // Nothing was shot, so no stranger's page reached the disk.
    expect(world.captureCalls).toEqual([])
    expect(world.downloads).toBe(0)
  })

  it('aborts when the tab switches during the retry delay', async () => {
    world.onCapture = async (attempt) => {
      if (attempt === 1) {
        world.activeTabId = STRANGER
        throw new Error('Chrome rejected the capture')
      }
      return DATA_URL
    }

    const report = await capturePage(TARGET, 'viewport')

    expect(report).toEqual({ ok: false, error: CAPTURE_TAB_CHANGED_ERROR })
    expect(world.captureCalls).toHaveLength(1)
    expect(world.downloads).toBe(0)
  })

  it('aborts when the tab switches while the capture is pending', async () => {
    world.onCapture = async () => {
      world.activeTabId = STRANGER
      return DATA_URL
    }

    const report = await capturePage(TARGET, 'viewport')

    expect(report).toEqual({ ok: false, error: CAPTURE_TAB_CHANGED_ERROR })
    expect(world.downloads).toBe(0)
  })

  it('aborts on a switch away and back that polling cannot see', async () => {
    world.onCapture = async () => {
      fire.activated(STRANGER)
      fire.activated(TARGET)
      return DATA_URL
    }

    const report = await capturePage(TARGET, 'viewport')

    expect(report).toEqual({ ok: false, error: CAPTURE_TAB_CHANGED_ERROR })
    expect(world.downloads).toBe(0)
  })

  it('aborts when the target navigates mid-capture', async () => {
    world.onCapture = async () => {
      fire.navigated(TARGET, 'https://example.com/next')
      return DATA_URL
    }

    const report = await capturePage(TARGET, 'viewport')

    expect(report).toEqual({ ok: false, error: CAPTURE_TAB_CHANGED_ERROR })
    expect(world.downloads).toBe(0)
  })

  it('ignores events about other tabs', async () => {
    world.onCapture = async () => {
      fire.navigated(STRANGER, 'https://other.example/next')
      fire.removed(STRANGER)
      return DATA_URL
    }

    const report = await capturePage(TARGET, 'viewport')

    expect(report.ok).toBe(true)
  })

  it('drops its listeners when the operation ends', async () => {
    await capturePage(TARGET, 'viewport')

    expect(world.listeners.activated).toHaveLength(0)
    expect(world.listeners.removed).toHaveLength(0)
    expect(world.listeners.updated).toHaveLength(0)
  })

  it('stops stitching and restores the page when the tab changes', async () => {
    world.onCapture = async (attempt) => {
      if (attempt === 2) world.activeTabId = STRANGER
      return DATA_URL
    }

    const report = await capturePage(TARGET, 'stitch')

    expect(report).toEqual({ ok: false, error: CAPTURE_TAB_CHANGED_ERROR })
    expect(world.scripted).toContain('restore')
    expect(
      world.stitch.filter((message) => message.type === messageTypes.addSlice),
    ).toHaveLength(1)
    expect(
      world.stitch.some(
        (message) => message.type === messageTypes.finishStitch,
      ),
    ).toBe(false)
    expect(world.downloads).toBe(0)
  })

  it('stitches every slice of a stable page', async () => {
    const report = await capturePage(TARGET, 'stitch')

    expect(report.ok).toBe(true)
    expect(
      world.stitch.filter((message) => message.type === messageTypes.addSlice),
    ).toHaveLength(2)
    expect(world.scripted).toContain('restore')
  })
})

describe('one capture at a time', () => {
  it('rejects a second request that arrives before the first resolves', async () => {
    const gate = deferred()
    world.gate = gate.promise

    const first = capturePage(TARGET, 'viewport')
    const second = await capturePage(TARGET, 'viewport')

    expect(second).toEqual({ ok: false, error: CAPTURE_BUSY_ERROR })
    gate.resolve()
    expect((await first).ok).toBe(true)
    // Exactly one operation ran.
    expect(world.captureCalls).toHaveLength(1)
    expect(world.downloads).toBe(1)
  })

  it('starts only one stitch for two simultaneous requests', async () => {
    const gate = deferred()
    world.gate = gate.promise

    const first = capturePage(TARGET, 'stitch')
    const second = await capturePage(TARGET, 'stitch')
    gate.resolve()
    await first

    expect(second).toEqual({ ok: false, error: CAPTURE_BUSY_ERROR })
    expect(
      world.stitch.filter(
        (message) => message.type === messageTypes.beginStitch,
      ),
    ).toHaveLength(1)
  })

  it('releases the lock when the tab cannot be resolved', async () => {
    const first = await capturePage(404, 'viewport')
    expect(first).toEqual({ ok: false, error: 'No tab to capture' })

    expect((await capturePage(TARGET, 'viewport')).ok).toBe(true)
  })

  it('releases the lock when the page cannot be captured', async () => {
    world.tabs[0].url = 'chrome://extensions'
    const blocked = await capturePage(TARGET, 'viewport')
    expect(blocked.ok).toBe(false)

    world.tabs[0].url = 'https://example.com/'
    expect((await capturePage(TARGET, 'viewport')).ok).toBe(true)
  })

  it('releases the lock after a failed capture', async () => {
    world.activeTabId = STRANGER
    expect((await capturePage(TARGET, 'viewport')).ok).toBe(false)

    world.activeTabId = TARGET
    expect((await capturePage(TARGET, 'viewport')).ok).toBe(true)
  })

  it('never lets a rejected request clear the running one', async () => {
    const gate = deferred()
    world.gate = gate.promise

    const first = capturePage(TARGET, 'viewport')
    expect(await capturePage(TARGET, 'viewport')).toEqual({
      ok: false,
      error: CAPTURE_BUSY_ERROR,
    })
    // The rejected request must not have freed the flag for a third caller.
    expect(await capturePage(TARGET, 'viewport')).toEqual({
      ok: false,
      error: CAPTURE_BUSY_ERROR,
    })

    gate.resolve()
    expect((await first).ok).toBe(true)
    expect((await capturePage(TARGET, 'viewport')).ok).toBe(true)
  })
})
