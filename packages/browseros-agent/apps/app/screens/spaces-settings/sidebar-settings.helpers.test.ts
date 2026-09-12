import { describe, expect, it } from 'bun:test'
import { validatePatch } from './sidebar-settings.helpers'

describe('validatePatch', () => {
  it('coerces numeric input from the form controls', () => {
    const result = validatePatch({ essentialsMax: '18' })
    expect(result).toEqual({ ok: true, value: { essentialsMax: 18 } })
  })

  it('rejects an essentials count outside 3 to 24', () => {
    expect(validatePatch({ essentialsMax: '2' }).ok).toBe(false)
    expect(validatePatch({ essentialsMax: '25' }).ok).toBe(false)
  })

  it('rejects a fractional discard timer', () => {
    expect(validatePatch({ discardInactiveSpacesAfterMin: '2.5' }).ok).toBe(
      false,
    )
  })

  it('accepts the archive and pinned enums', () => {
    expect(validatePatch({ autoArchiveAfter: '1h' }).ok).toBe(true)
    expect(validatePatch({ pinnedCloseBehavior: 'close' }).ok).toBe(true)
    expect(validatePatch({ autoArchiveAfter: '5h' }).ok).toBe(false)
  })

  it('validates only the keys in the patch', () => {
    const result = validatePatch({ naturalScroll: true })
    expect(result).toEqual({ ok: true, value: { naturalScroll: true } })
  })
})
