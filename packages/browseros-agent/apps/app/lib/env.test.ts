import { describe, expect, it } from 'bun:test'
import {
  browserOSApiMatchOrigin,
  hostedApiConfigured,
  parseBrowserOSApiUrl,
  UNCONFIGURED_API_ORIGIN,
} from './browseros-api-url'
import { parseAlphaFeaturesFlag } from './env'

describe('parseAlphaFeaturesFlag', () => {
  it('defaults alpha features off when unset', () => {
    expect(parseAlphaFeaturesFlag(undefined)).toBe(false)
  })

  it('keeps explicit true enabled', () => {
    expect(parseAlphaFeaturesFlag('true')).toBe(true)
  })

  it('keeps explicit false disabled', () => {
    expect(parseAlphaFeaturesFlag('false')).toBe(false)
  })
})

describe('parseBrowserOSApiUrl', () => {
  it('defaults to no hosted API when unset', () => {
    expect(parseBrowserOSApiUrl(undefined)).toBe('')
  })

  it('treats a blank value as no hosted API', () => {
    expect(parseBrowserOSApiUrl('   ')).toBe('')
  })

  it('preserves explicit overrides', () => {
    expect(parseBrowserOSApiUrl('http://127.0.0.1:3000')).toBe(
      'http://127.0.0.1:3000',
    )
  })

  it('rejects overrides without a scheme', () => {
    expect(() => parseBrowserOSApiUrl('api.browseros.com')).toThrow(
      'VITE_PUBLIC_BROWSEROS_API must be a valid URL including http:// or https://',
    )
  })

  it('rejects non-HTTP overrides', () => {
    expect(() =>
      parseBrowserOSApiUrl('chrome-extension://extension-id'),
    ).toThrow('VITE_PUBLIC_BROWSEROS_API must use http:// or https://')
  })

  it('returns a URL that can form a valid WXT match pattern', () => {
    expect(`${parseBrowserOSApiUrl('https://api.example.com')}/home`).toBe(
      'https://api.example.com/home',
    )
  })

  it('falls back to a never-resolving origin for match patterns', () => {
    expect(browserOSApiMatchOrigin(undefined)).toBe(UNCONFIGURED_API_ORIGIN)
    expect(browserOSApiMatchOrigin('https://api.example.com')).toBe(
      'https://api.example.com',
    )
  })

  it('reports whether a hosted API is configured', () => {
    expect(hostedApiConfigured(undefined)).toBe(false)
    expect(hostedApiConfigured('https://api.example.com')).toBe(true)
  })
})
