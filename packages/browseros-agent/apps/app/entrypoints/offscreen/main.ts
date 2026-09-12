import {
  CaptureMessageType,
  onCaptureMessage,
} from '@/lib/messaging/capture/captureMessages'

// Service workers have no canvas or clipboard; this document stitches the
// viewport slices of a capture and puts finished PNGs on the clipboard.

interface Slice {
  bitmap: ImageBitmap
  y: number
}

let page = { width: 0, height: 0, cropTop: 0 }
let slices: Slice[] = []

async function toBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob()
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function copyToClipboard(blob: Blob): Promise<boolean> {
  try {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
    return true
  } catch {
    return false
  }
}

async function compose(): Promise<Blob> {
  const [first] = slices
  if (!first) throw new Error('No slices captured')
  // Captures come back in device pixels; derive the scale from the first
  // slice so zoom and devicePixelRatio need no separate bookkeeping.
  const scale = first.bitmap.width / page.width
  const canvas = new OffscreenCanvas(
    Math.round(page.width * scale),
    Math.round(page.height * scale),
  )
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  const crop = Math.round(page.cropTop * scale)
  for (const slice of slices) {
    const height = slice.bitmap.height - crop
    ctx.drawImage(
      slice.bitmap,
      0,
      crop,
      slice.bitmap.width,
      height,
      0,
      Math.round(slice.y * scale),
      slice.bitmap.width,
      height,
    )
    slice.bitmap.close()
  }
  return canvas.convertToBlob({ type: 'image/png' })
}

onCaptureMessage(CaptureMessageType.copyImage, async ({ data }) => {
  return copyToClipboard(await toBlob(data.dataUrl))
})

onCaptureMessage(CaptureMessageType.beginStitch, ({ data }) => {
  for (const slice of slices) slice.bitmap.close()
  slices = []
  page = data
})

onCaptureMessage(CaptureMessageType.addSlice, async ({ data }) => {
  const bitmap = await createImageBitmap(await toBlob(data.dataUrl))
  slices.push({ bitmap, y: data.y })
})

onCaptureMessage(CaptureMessageType.finishStitch, async () => {
  const blob = await compose()
  slices = []
  return {
    dataUrl: await blobToDataUrl(blob),
    copied: await copyToClipboard(blob),
  }
})
