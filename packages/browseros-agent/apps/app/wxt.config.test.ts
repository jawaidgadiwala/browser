import { describe, expect, it } from 'bun:test'
import { PRODUCT_NAME } from '@/lib/personal/product'
import config from './wxt.config'

describe('extension manifest naming', () => {
  it('names the extension after the product', () => {
    const manifest = config.manifest as {
      name: string
      action: { default_title: string }
    }

    expect(manifest.name).toBe(PRODUCT_NAME)
    expect(manifest.action.default_title).toBe(`Ask ${PRODUCT_NAME}`)
  })
})
