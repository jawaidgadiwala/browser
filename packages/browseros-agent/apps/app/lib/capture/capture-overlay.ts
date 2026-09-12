interface CaptureOverlayArgs {
  dataUrl: string
  title: string
  truncated: boolean
  /** Write the PNG from the page: it is focused and still has the shortcut's user activation. */
  copy: boolean
}

/**
 * Runs inside the captured page via chrome.scripting, so it must stay
 * self-contained: no imports, no closures over module scope.
 */
export async function showCaptureOverlay(
  args: CaptureOverlayArgs,
): Promise<{ copied: boolean }> {
  let copied = !args.copy
  if (args.copy) {
    try {
      const blob = await (await fetch(args.dataUrl)).blob()
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ])
      copied = true
    } catch {
      copied = false
    }
  }

  const id = 'browseros-capture-overlay'
  document.getElementById(id)?.remove()
  const host = document.createElement('div')
  host.id = id
  host.style.cssText =
    'position:fixed;right:16px;bottom:16px;z-index:2147483647;pointer-events:none;'
  const shadow = host.attachShadow({ mode: 'closed' })
  shadow.innerHTML = `
    <style>
      .card{display:flex;align-items:center;gap:12px;padding:10px 14px 10px 10px;
        background:rgba(24,24,27,.92);color:#fafafa;border-radius:12px;
        box-shadow:0 8px 30px rgba(0,0,0,.35);font:500 13px/1.3 -apple-system,system-ui,sans-serif;
        opacity:0;transform:translateY(8px);transition:opacity .18s ease,transform .18s ease}
      .card.in{opacity:1;transform:none}
      img{width:96px;height:60px;object-fit:cover;object-position:top;border-radius:6px;
        border:1px solid rgba(255,255,255,.15);background:#fff}
      small{display:block;color:#a1a1aa;font-weight:400;margin-top:2px}
    </style>
    <div class="card"><img alt=""><div><span></span><small></small></div></div>`
  const card = shadow.querySelector('.card') as HTMLElement
  ;(shadow.querySelector('img') as HTMLImageElement).src = args.dataUrl
  ;(shadow.querySelector('span') as HTMLElement).textContent = args.title
  ;(shadow.querySelector('small') as HTMLElement).textContent =
    `${copied ? 'Copied and saved' : 'Saved to Downloads'}${args.truncated ? ' · truncated' : ''}`
  document.documentElement.appendChild(host)
  requestAnimationFrame(() => card.classList.add('in'))
  setTimeout(() => {
    card.classList.remove('in')
    setTimeout(() => host.remove(), 250)
  }, 3000)
  return { copied }
}
