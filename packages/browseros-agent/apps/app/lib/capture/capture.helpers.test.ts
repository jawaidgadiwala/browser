import { describe, expect, it } from 'bun:test'
import {
  captureDownloadPath,
  captureFilename,
  invalidatesCapture,
  isCapturableUrl,
  isCaptureTargetActive,
  maxCaptureHeight,
  planSlices,
} from './capture.helpers'

describe('isCapturableUrl', () => {
  it('accepts web and file pages', () => {
    expect(isCapturableUrl('https://example.com/')).toBe(true)
    expect(isCapturableUrl('http://127.0.0.1:8080/x')).toBe(true)
    expect(isCapturableUrl('file:///tmp/a.html')).toBe(true)
  })

  it('rejects browser and extension pages', () => {
    expect(isCapturableUrl('chrome://extensions')).toBe(false)
    expect(isCapturableUrl('chrome-extension://abc/app.html')).toBe(false)
    expect(isCapturableUrl('about:blank')).toBe(false)
    expect(isCapturableUrl(undefined)).toBe(false)
    expect(isCapturableUrl('')).toBe(false)
  })
})

describe('captureFilename', () => {
  it('formats the capture file name with zero padding', () => {
    const date = new Date(2026, 8, 3, 7, 4, 5)
    expect(captureFilename(date)).toBe(
      'Browser Capture 2026-09-03 at 07.04.05.png',
    )
  })

  it('nests the file in the captures folder', () => {
    const date = new Date(2026, 11, 31, 23, 59, 59)
    expect(captureDownloadPath(date)).toBe(
      'Browser Captures/Browser Capture 2026-12-31 at 23.59.59.png',
    )
  })
})

describe('planSlices', () => {
  it('returns a single slice when the page fits the viewport', () => {
    expect(planSlices(500, 900, 20000)).toEqual({
      offsets: [0],
      height: 500,
      truncated: false,
    })
  })

  it('steps by the viewport and ends the last slice at the page bottom', () => {
    expect(planSlices(2500, 1000, 20000)).toEqual({
      offsets: [0, 1000, 1500],
      height: 2500,
      truncated: false,
    })
    expect(planSlices(2000, 1000, 20000).offsets).toEqual([0, 1000])
  })

  it('caps the height and flags truncation', () => {
    const plan = planSlices(50000, 1000, 3000)
    expect(plan.height).toBe(3000)
    expect(plan.truncated).toBe(true)
    expect(plan.offsets.at(-1)).toBe(2000)
  })
})

describe('maxCaptureHeight', () => {
  it('uses the CSS cap at 1x', () => {
    expect(maxCaptureHeight(1280, 1)).toBe(20000)
  })

  it('halves the cap on retina so the canvas side stays under the limit', () => {
    expect(maxCaptureHeight(960, 2)).toBe(16000)
  })

  it('respects the total area on very wide pages', () => {
    expect(maxCaptureHeight(5000, 3)).toBe(5777)
  })
})

describe('isCaptureTargetActive', () => {
  const target = { tabId: 7, windowId: 3 }

  it('accepts the scrolled tab while it stays active in its window', () => {
    expect(
      isCaptureTargetActive(target, { id: 7, windowId: 3, active: true }),
    ).toBe(true)
  })

  it('rejects another tab, another window, or a closed tab', () => {
    expect(
      isCaptureTargetActive(target, { id: 7, windowId: 3, active: false }),
    ).toBe(false)
    expect(
      isCaptureTargetActive(target, { id: 8, windowId: 3, active: true }),
    ).toBe(false)
    expect(
      isCaptureTargetActive(target, { id: 7, windowId: 4, active: true }),
    ).toBe(false)
    expect(isCaptureTargetActive(target, null)).toBe(false)
    expect(isCaptureTargetActive(target, undefined)).toBe(false)
    expect(isCaptureTargetActive(target, {})).toBe(false)
  })
})

describe('invalidatesCapture', () => {
  const target = { tabId: 7, windowId: 3 }

  it('latches a switch to another tab of the same window', () => {
    expect(
      invalidatesCapture(target, {
        kind: 'activated',
        tabId: 8,
        windowId: 3,
      }),
    ).toBe(true)
  })

  it('ignores activity in another window or the target itself', () => {
    expect(
      invalidatesCapture(target, {
        kind: 'activated',
        tabId: 8,
        windowId: 4,
      }),
    ).toBe(false)
    expect(
      invalidatesCapture(target, {
        kind: 'activated',
        tabId: 7,
        windowId: 3,
      }),
    ).toBe(false)
  })

  it('latches the target closing or navigating, not another tab', () => {
    expect(invalidatesCapture(target, { kind: 'removed', tabId: 7 })).toBe(true)
    expect(invalidatesCapture(target, { kind: 'removed', tabId: 8 })).toBe(
      false,
    )
    expect(
      invalidatesCapture(target, {
        kind: 'navigated',
        tabId: 7,
        url: 'https://example.com/next',
      }),
    ).toBe(true)
    expect(invalidatesCapture(target, { kind: 'navigated', tabId: 7 })).toBe(
      false,
    )
    expect(
      invalidatesCapture(target, {
        kind: 'navigated',
        tabId: 8,
        url: 'https://other.example/',
      }),
    ).toBe(false)
  })
})
