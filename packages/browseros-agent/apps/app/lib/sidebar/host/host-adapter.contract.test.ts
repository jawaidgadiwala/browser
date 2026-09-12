import { describe, expect, it } from 'bun:test'
import { newSpace } from '../core/model'
import { FakeHost } from './fake-host'
import { type HostAdapter, NO_GROUP, type TabEvent } from './host-adapter'

/**
 * One suite, any adapter. `describeHostAdapter` only uses interface methods,
 * so pointing it at a live browser adapter later needs no new assertions.
 */

const WORK = newSpace({ name: 'Work', color: 'blue' }, { now: 0 })

function describeHostAdapter(label: string, create: () => HostAdapter) {
  describe(label, () => {
    it('lists a normal window', async () => {
      const host = create()
      const windows = await host.listWindows()
      expect(windows.length).toBeGreaterThan(0)
      expect(windows[0].type).toBe('normal')
    })

    it('creates, lists and closes tabs', async () => {
      const host = create()
      const [window] = await host.listWindows()
      const tab = await host.create({
        windowId: window.id,
        url: 'https://example.com/',
      })

      expect(tab.windowId).toBe(window.id)
      expect(tab.groupId).toBe(NO_GROUP)
      expect(await host.listTabs(window.id)).toContainEqual(
        expect.objectContaining({ id: tab.id }),
      )

      await host.close([tab.id])
      const remaining = await host.listTabs(window.id)
      expect(remaining.some((candidate) => candidate.id === tab.id)).toBe(false)
    })

    it('creates a group for a space once and reuses it', async () => {
      const host = create()
      const [window] = await host.listWindows()
      const seed = await host.create({ windowId: window.id })

      const groupId = await host.ensureGroup(window.id, WORK, [seed.id])
      const again = await host.ensureGroup(window.id, WORK)

      expect(again).toBe(groupId)
      const [group] = await host.listGroups(window.id)
      expect(group).toMatchObject({ title: 'Work', color: 'blue' })
      const tabs = await host.listTabs(window.id)
      expect(tabs.find((tab) => tab.id === seed.id)?.groupId).toBe(groupId)
    })

    it('groups, ungroups and collapses', async () => {
      const host = create()
      const [window] = await host.listWindows()
      const seed = await host.create({ windowId: window.id })
      const groupId = await host.ensureGroup(window.id, WORK, [seed.id])
      const loose = await host.create({ windowId: window.id })

      await host.groupTabs([loose.id], groupId)
      const grouped = await host.listTabs(window.id)
      expect(grouped.find((tab) => tab.id === loose.id)?.groupId).toBe(groupId)

      await host.setGroupCollapsed(groupId, true)
      expect((await host.listGroups(window.id))[0].collapsed).toBe(true)

      await host.ungroup([loose.id])
      const ungrouped = await host.listTabs(window.id)
      expect(ungrouped.find((tab) => tab.id === loose.id)?.groupId).toBe(
        NO_GROUP,
      )
    })

    it('activates, navigates and discards', async () => {
      const host = create()
      const [window] = await host.listWindows()
      const first = await host.create({ windowId: window.id })
      const second = await host.create({ windowId: window.id })

      await host.activate(first.id)
      const afterActivate = await host.listTabs(window.id)
      expect(afterActivate.find((tab) => tab.id === first.id)?.active).toBe(
        true,
      )
      expect(afterActivate.find((tab) => tab.id === second.id)?.active).toBe(
        false,
      )

      await host.navigate(second.id, 'https://example.org/')
      await host.discard([second.id])
      const tabs = await host.listTabs(window.id)
      expect(tabs.find((tab) => tab.id === second.id)).toMatchObject({
        url: 'https://example.org/',
        discarded: true,
      })
    })

    it('builds a favicon url with the page url and a size', () => {
      const host = create()
      const url = new URL(host.faviconUrl('https://example.com/a?b=c'))
      expect(url.pathname).toBe('/_favicon/')
      expect(url.searchParams.get('pageUrl')).toBe('https://example.com/a?b=c')
      expect(url.searchParams.get('size')).toBe('32')
    })

    it('fans tab lifecycle into one typed stream', async () => {
      const host = create()
      const events: TabEvent[] = []
      const unsubscribe = host.onTabEvent((event) => events.push(event))
      const [window] = await host.listWindows()

      const tab = await host.create({ windowId: window.id })
      await host.activate(tab.id)
      await host.navigate(tab.id, 'https://example.com/')
      await host.move(tab.id, { index: 0 })
      await host.close([tab.id])
      unsubscribe()
      await host.create({ windowId: window.id })

      const types = events.map((event) => event.type)
      expect(types).toContain('created')
      expect(types).toContain('activated')
      expect(types).toContain('updated')
      expect(types).toContain('moved')
      expect(types).toContain('removed')
      const removed = events.filter((event) => event.type === 'removed')
      expect(removed[0]).toMatchObject({ tabId: tab.id, windowId: window.id })
      // Unsubscribed listeners stop receiving; the last create is not counted.
      expect(events.filter((event) => event.type === 'created')).toHaveLength(1)
    })
  })
}

describeHostAdapter('FakeHost', () => new FakeHost())

describe('FakeHost simulation helpers', () => {
  it('emits attach and detach when a tab moves window', () => {
    const host = new FakeHost()
    const second = host.addWindow()
    const tab = host.addTab()
    const events: TabEvent[] = []
    host.onTabEvent((event) => events.push(event))

    host.attachTab(tab.id, second.id)

    expect(events.map((event) => event.type)).toEqual(['detached', 'attached'])
    expect(host.tab(tab.id)?.windowId).toBe(second.id)
  })

  it('emits replaced with both ids', () => {
    const host = new FakeHost()
    const events: TabEvent[] = []
    host.onTabEvent((event) => events.push(event))

    host.replaceTab(7, 8)

    expect(events[0]).toEqual({
      type: 'replaced',
      removedTabId: 7,
      addedTabId: 8,
    })
  })

  it('notifies window focus listeners', () => {
    const host = new FakeHost()
    const second = host.addWindow()
    const focused: number[] = []
    host.onWindowFocus((windowId) => focused.push(windowId))

    host.focusWindow(second.id)

    expect(focused).toEqual([second.id])
    expect(host.windows[1].focused).toBe(true)
  })
})
