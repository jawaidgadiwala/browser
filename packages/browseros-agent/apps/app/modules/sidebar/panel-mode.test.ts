import { beforeAll, describe, expect, it, mock } from 'bun:test'

mock.module('@wxt-dev/storage', () => ({
  storage: {
    defineItem: () => ({
      getValue: async () => 'sidebar',
      setValue: async () => {},
      watch: () => () => {},
    }),
  },
}))

let panelMode: typeof import('./panel-mode')

beforeAll(async () => {
  panelMode = await import('./panel-mode')
})

describe('panel mode', () => {
  it('routes each mode to its surface', () => {
    expect(panelMode.routeForMode('sidebar')).toBe('/sidebar')
    expect(panelMode.routeForMode('chat')).toBe('/chat')
  })

  it('flips between the two surfaces', () => {
    expect(panelMode.otherMode('sidebar')).toBe('chat')
    expect(panelMode.otherMode('chat')).toBe('sidebar')
  })

  it('treats every non-sidebar route as chat', () => {
    expect(panelMode.modeForPath('/sidebar')).toBe('sidebar')
    expect(panelMode.modeForPath('/chat')).toBe('chat')
    expect(panelMode.modeForPath('/history')).toBe('chat')
    expect(panelMode.modeForPath('/')).toBe('chat')
  })
})
