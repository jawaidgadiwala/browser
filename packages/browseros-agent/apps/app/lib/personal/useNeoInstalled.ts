import { useEffect, useState } from 'react'
import { NEO_EXTENSION_ID } from './neo-extension'

/**
 * Without the `management` permission the only probe is fetching the other
 * extension's manifest. Chromium blocks that unless it is web-accessible, so
 * a failed fetch is ambiguous and we keep the links visible.
 */
export function useNeoInstalled(): boolean {
  const [installed, setInstalled] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(`chrome-extension://${NEO_EXTENSION_ID}/manifest.json`)
      .then((response) => {
        if (!cancelled) setInstalled(response.ok)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  return installed
}
