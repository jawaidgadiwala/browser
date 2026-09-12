import { describe, expect, it } from 'bun:test'
import {
  findChatProviderById,
  resolveChatProvider,
  selectableChatProviders,
} from './provider-runtime'
import type { LlmProviderConfig } from './types'

const hosted = {
  id: 'browseros',
  type: 'browseros',
  name: 'Browser AI',
  modelId: 'browseros-auto',
} as LlmProviderConfig

const own = {
  id: 'openai-1',
  type: 'openai',
  name: 'My OpenAI',
  modelId: 'gpt-5.5',
} as LlmProviderConfig

// The hosted provider is a metered upstream service this build does not ship.
// A profile upgraded from a build that did still carries the row and may still
// name it as the default, so every resolution path has to withhold it.
describe('withheld hosted provider', () => {
  it('is filtered out of the selectable list', () => {
    expect(selectableChatProviders([hosted, own])).toEqual([own])
    expect(selectableChatProviders([hosted])).toEqual([])
  })

  it('is never returned by id, even when named explicitly', () => {
    expect(findChatProviderById([hosted, own], hosted.id)).toBeNull()
    expect(findChatProviderById([hosted, own], own.id)).toEqual(own)
  })

  it('is skipped when it is the persisted default', () => {
    expect(resolveChatProvider([hosted, own], hosted.id)).toEqual(own)
  })

  it('leaves nothing to resolve when it is the only provider', () => {
    expect(resolveChatProvider([hosted], hosted.id)).toBeNull()
    expect(resolveChatProvider([hosted])).toBeNull()
  })
})
