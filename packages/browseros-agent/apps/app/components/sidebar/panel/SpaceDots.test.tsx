import { describe, expect, it } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Space } from '@/lib/sidebar/core/types'
import { DOT_MIN } from '@/modules/sidebar/sidebar-rows.helpers'
import { SpaceDots } from './SpaceDots'

function space(id: string, name: string): Space {
  return {
    id,
    name,
    icon: '💼',
    color: 'blue',
    theme: { keyColors: [], wheel: 'analogous', intensity: 0.4, noise: 0 },
    containers: { pinned: `${id}-p`, today: `${id}-t` },
    pinnedCollapsed: false,
    createdAt: 0,
  }
}

describe('SpaceDots', () => {
  it('stays hidden while a single space cannot be switched away from', () => {
    const html = renderToStaticMarkup(
      <SpaceDots
        spaces={[space('s1', 'Work')]}
        activeSpaceId="s1"
        onSwitch={() => {}}
      />,
    )
    expect(html).toBe('')
  })

  it('renders one dot per space and shrinks them before an unmeasured strip', () => {
    const spaces = Array.from({ length: 6 }, (_, index) =>
      space(`s${index}`, `Space ${index}`),
    )
    const html = renderToStaticMarkup(
      <SpaceDots spaces={spaces} activeSpaceId="s2" onSwitch={() => {}} />,
    )
    expect(html.match(/role="tab"/g)).toHaveLength(6)
    expect(html).toContain(`width:${DOT_MIN}px`)
    expect(html).toContain('aria-selected="true"')
  })
})
