import { describe, expect, it } from 'bun:test'
import { resolveDefaultProviderId } from '@/lib/llm-providers/provider-selection'
import type { LlmProviderConfig } from '@/lib/llm-providers/types'
import { hostedProviderEnabled, PERSONAL_BUILD } from './personal-build'
import {
  HOSTED_PROVIDER_DESCRIPTION,
  HOSTED_PROVIDER_NAME,
  PRODUCT_NAME,
} from './product'

const custom = {
  id: 'p1',
  name: 'My OpenAI',
  type: 'openai',
  modelId: 'gpt-5.5',
} as LlmProviderConfig

describe('product naming', () => {
  it('keeps the upstream product name out of user-facing copy', () => {
    expect(PRODUCT_NAME).toBe('Browser')
    expect(PRODUCT_NAME).not.toContain('BrowserOS')
  })

  it('names and describes the hosted provider without the upstream product', () => {
    expect(HOSTED_PROVIDER_NAME).toBe('Browser AI')
    expect(HOSTED_PROVIDER_DESCRIPTION).toBe(
      'Hosted model with strict rate limits',
    )
    expect(HOSTED_PROVIDER_DESCRIPTION).not.toContain('BrowserOS')
  })

  it('derives the composer placeholder from the product name', () => {
    expect(`Ask ${PRODUCT_NAME} to handle a task...`).toBe(
      'Ask Browser to handle a task...',
    )
  })
})

describe('hosted provider gate', () => {
  it('is off while this is the product build', () => {
    expect(PERSONAL_BUILD).toBe(true)
    expect(hostedProviderEnabled()).toBe(false)
  })

  it('names no default when nothing is configured', () => {
    expect(resolveDefaultProviderId([], null)).toBe('')
    expect(resolveDefaultProviderId([], 'browseros')).toBe('')
  })

  it('defaults to the first configured provider instead', () => {
    expect(resolveDefaultProviderId([custom], null)).toBe('p1')
    expect(resolveDefaultProviderId([custom], 'browseros')).toBe('p1')
  })
})
