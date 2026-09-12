import { defineExtensionMessaging } from '@webext-core/messaging'

export const CaptureMessageType = {
  /** UI asks the background to capture a tab (defaults to the active tab). */
  now: 'capture.now',
  /** Put a finished PNG on the clipboard. */
  copyImage: 'capture.copyImage',
  /** Background streams viewport slices into the offscreen document. */
  beginStitch: 'capture.beginStitch',
  addSlice: 'capture.addSlice',
  /** Compose, copy to the clipboard and hand back the PNG. */
  finishStitch: 'capture.finishStitch',
} as const

/** `full` tries the debugger first and falls back to `stitch`. */
export type CaptureMode = 'full' | 'stitch' | 'viewport'

interface CaptureNowData {
  tabId?: number
  mode?: CaptureMode
}

export type CaptureReport =
  | { ok: true; method: CaptureMode; copied: boolean; truncated: boolean }
  | { ok: false; error: string }

interface CopyImageData {
  dataUrl: string
}

interface BeginStitchData {
  /** CSS pixel size of the composed page. */
  width: number
  height: number
  /** Viewport rows above the scroller to drop from every slice. */
  cropTop: number
}

interface AddSliceData {
  dataUrl: string
  /** Scroll offset (CSS px) the slice was captured at. */
  y: number
}

interface FinishStitchResult {
  dataUrl: string
  copied: boolean
}

type CaptureMessagesProtocol = {
  [CaptureMessageType.now](data: CaptureNowData): CaptureReport
  [CaptureMessageType.copyImage](data: CopyImageData): boolean
  [CaptureMessageType.beginStitch](data: BeginStitchData): void
  [CaptureMessageType.addSlice](data: AddSliceData): void
  [CaptureMessageType.finishStitch](): FinishStitchResult
}

const { sendMessage, onMessage } =
  defineExtensionMessaging<CaptureMessagesProtocol>()

export { onMessage as onCaptureMessage, sendMessage as sendCaptureMessage }
