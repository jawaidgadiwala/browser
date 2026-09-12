import { describe, expect, it } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { PRODUCT_NAME } from '@/lib/product'
import { VisualRail } from './VisualRail'

describe('VisualRail', () => {
  it('renders the brand from the chromium-allowlisted icon path', () => {
    const html = renderToStaticMarkup(<VisualRail />)

    // A literal /icon/128.png keeps the chromium build allowlist happy; an
    // import would emit a new hashed asset and fail verify-chromium-build.ts.
    expect(html).toContain('src="/icon/128.png"')
    expect(html).toContain(PRODUCT_NAME)
    expect(html).not.toContain('BrowserOS')
    expect(html).toContain('agentic browser')
    expect(html).toContain('automate any web task')
    expect(html).toContain('Bring your browser')
    expect(html).toContain('Local-first. Private.')
  })
})
