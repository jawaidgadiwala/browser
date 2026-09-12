import { beforeEach, describe, expect, it } from 'bun:test'
import { createInitialState, createSpace, pin } from './core/model'
import type { SidebarState, Space } from './core/types'
import { FakeHost } from './host/fake-host'
import { NO_GROUP, type TabEvent } from './host/host-adapter'
import { createMemoryStores, SidebarReconciler } from './reconciler'

/**
 * Recorded event sequences against `FakeHost`. Nothing here touches
 * `chrome.*`, so the whole reducer is exercised in-process.
 */

const HOUR = 3_600_000
const START = 1_700_000_000_000

let counter = 0
const newId = () => {
  counter += 1
  return `i${counter}`
}

interface Fixture {
  host: FakeHost
  reconciler: SidebarReconciler
  store: ReturnType<typeof createMemoryStores>['store']
  session: ReturnType<typeof createMemoryStores>['session']
  work: Space
  life: Space
  clock: { now: number }
}

function baseState(): { state: SidebarState; work: Space; life: Space } {
  const initial = createInitialState({ now: START, newId })
  const first = createSpace(
    initial,
    { name: 'Work', color: 'blue' },
    { now: START, newId },
  )
  const second = createSpace(
    { ...first.state, activeSpaceId: first.space.id },
    { name: 'Life', color: 'green' },
    { now: START, newId },
  )
  return {
    state: { ...second.state, activeSpaceId: first.space.id },
    work: first.space,
    life: second.space,
  }
}

function setup(
  state?: SidebarState,
  spaces?: { work: Space; life: Space },
): Fixture {
  const base = spaces
    ? { state: state as SidebarState, ...spaces }
    : baseState()
  const stores = createMemoryStores(state ?? base.state)
  const host = new FakeHost()
  const clock = { now: START }
  const reconciler = new SidebarReconciler({
    host,
    store: stores.store,
    session: stores.session,
    now: () => clock.now,
    adoptDelayMs: 0,
  })
  return {
    host,
    reconciler,
    ...stores,
    work: base.work,
    life: base.life,
    clock,
  }
}

function lastEvent(host: FakeHost): TabEvent {
  const event = host.emitted.at(-1)
  if (!event) throw new Error('No event emitted')
  return event
}

beforeEach(() => {
  counter = 0
})

describe('fresh start', () => {
  it('leaves loose tabs alone until a space adopts them', async () => {
    const fixture = setup()
    fixture.host.addTab({ url: 'https://a.example/' })
    fixture.host.addTab({ url: 'https://b.example/' })

    await fixture.reconciler.reconcile()

    expect(fixture.host.groups).toHaveLength(0)
    const session = await fixture.session.read()
    expect(session.groupLinks).toEqual({})
    expect(session.tabLinks).toEqual({})

    await fixture.reconciler.adoptLooseTabs(fixture.work.id)

    const [group] = fixture.host.groups
    expect(group).toMatchObject({ title: 'Work', color: 'blue' })
    expect(fixture.host.tabsInGroup(group.id)).toHaveLength(2)
    expect((await fixture.session.read()).groupLinks).toEqual({
      [`1:${fixture.work.id}`]: group.id,
    })
  })
})

describe('restart reconcile', () => {
  it('rebuilds group links by title and tab links by url', async () => {
    const base = baseState()
    const pinned = pin(
      base.state,
      base.work.id,
      { url: 'https://mail.example/', savedTitle: 'Mail' },
      { now: START, newId },
    )
    const fixture = setup(pinned.state, { work: base.work, life: base.life })

    const mail = fixture.host.addTab({ url: 'https://mail.example/' })
    const docs = fixture.host.addTab({ url: 'https://docs.example/' })
    const group = fixture.host.addGroup({
      title: 'Work',
      color: 'blue',
      tabIds: [mail.id, docs.id],
    })

    await fixture.reconciler.reconcile()

    const session = await fixture.session.read()
    expect(session.groupLinks[`1:${fixture.work.id}`]).toBe(group.id)
    expect(session.tabLinks).toEqual({ [String(mail.id)]: pinned.item.id })
    expect(session.tabActiveAt[String(docs.id)]).toBe(START)
  })

  it('drops links to tabs and spaces that are gone', async () => {
    const fixture = setup()
    await fixture.session.write({
      tabLinks: { '999': 'ghost' },
      lastSelected: { [fixture.work.id]: 999, ghost: 1 },
      unread: [999],
    })

    await fixture.reconciler.reconcile()

    const session = await fixture.session.read()
    expect(session.tabLinks).toEqual({})
    expect(session.lastSelected).toEqual({})
    expect(session.unread).toEqual([])
  })
})

describe('switch', () => {
  it('expands the target, activates its selection and collapses the rest', async () => {
    const fixture = setup()
    const workTab = fixture.host.addTab({ url: 'https://work.example/' })
    const workGroup = fixture.host.addGroup({
      title: 'Work',
      color: 'blue',
      tabIds: [workTab.id],
    })
    const lifeFirst = fixture.host.addTab({ url: 'https://life.example/1' })
    const lifeSecond = fixture.host.addTab({ url: 'https://life.example/2' })
    const lifeGroup = fixture.host.addGroup({
      title: 'Life',
      color: 'green',
      collapsed: true,
      tabIds: [lifeFirst.id, lifeSecond.id],
    })
    fixture.host.activateTab(workTab.id)
    await fixture.reconciler.reconcile()

    await fixture.reconciler.switchSpace(fixture.life.id)

    expect(fixture.host.group(lifeGroup.id)?.collapsed).toBe(false)
    expect(fixture.host.group(workGroup.id)?.collapsed).toBe(true)
    expect(fixture.host.tab(lifeFirst.id)?.active).toBe(true)
    expect((await fixture.store.read()).activeSpaceId).toBe(fixture.life.id)

    const session = await fixture.session.read()
    // The tab we left behind is remembered for the next visit to Work.
    expect(session.lastSelected[fixture.work.id]).toBe(workTab.id)
    expect(session.lastSelected[fixture.life.id]).toBe(lifeFirst.id)

    fixture.host.activateTab(lifeSecond.id)
    await fixture.reconciler.handleTabEvent(lastEvent(fixture.host))
    await fixture.reconciler.switchSpace(fixture.work.id)
    await fixture.reconciler.switchSpace(fixture.life.id)

    expect(fixture.host.tab(lifeSecond.id)?.active).toBe(true)
  })

  it('creates the group lazily on first switch', async () => {
    const fixture = setup()
    await fixture.reconciler.reconcile()

    await fixture.reconciler.switchSpace(fixture.life.id)

    expect(fixture.host.groups).toHaveLength(1)
    expect(fixture.host.groups[0].title).toBe('Life')
    expect(fixture.host.tabsInGroup(fixture.host.groups[0].id)).toHaveLength(1)
  })
})

describe('adopt and follow', () => {
  it('adopts a new loose tab into the active space group', async () => {
    const fixture = setup()
    const seed = fixture.host.addTab({ url: 'https://work.example/' })
    const workGroup = fixture.host.addGroup({
      title: 'Work',
      color: 'blue',
      tabIds: [seed.id],
    })
    await fixture.reconciler.reconcile()

    const fresh = fixture.host.addTab({ url: 'https://new.example/' })
    await fixture.reconciler.handleTabEvent(lastEvent(fixture.host))

    expect(fixture.host.tab(fresh.id)?.groupId).toBe(workGroup.id)
  })

  it('leaves a tab the browser already grouped where it is', async () => {
    const fixture = setup()
    const lifeGroup = fixture.host.addGroup({ title: 'Life', color: 'green' })
    fixture.host.addGroup({ title: 'Work', color: 'blue' })
    await fixture.reconciler.reconcile()

    const fresh = fixture.host.addTab({ groupId: lifeGroup.id })
    await fixture.reconciler.handleTabEvent(lastEvent(fixture.host))

    expect(fixture.host.tab(fresh.id)?.groupId).toBe(lifeGroup.id)
  })

  it('follows the space of an activated tab and collapses the others', async () => {
    const fixture = setup()
    const workTab = fixture.host.addTab({ url: 'https://work.example/' })
    const workGroup = fixture.host.addGroup({
      title: 'Work',
      color: 'blue',
      tabIds: [workTab.id],
    })
    const lifeTab = fixture.host.addTab({ url: 'https://life.example/' })
    fixture.host.addGroup({
      title: 'Life',
      color: 'green',
      tabIds: [lifeTab.id],
    })
    await fixture.reconciler.reconcile()

    fixture.host.activateTab(lifeTab.id)
    await fixture.reconciler.handleTabEvent(lastEvent(fixture.host))

    expect((await fixture.store.read()).activeSpaceId).toBe(fixture.life.id)
    expect(fixture.host.group(workGroup.id)?.collapsed).toBe(true)
    const session = await fixture.session.read()
    expect(session.lastSelected[fixture.life.id]).toBe(lifeTab.id)
  })

  it('keeps the pinned link and canonical url when a pinned tab drifts', async () => {
    const base = baseState()
    const pinned = pin(
      base.state,
      base.work.id,
      { url: 'https://mail.example/', savedTitle: 'Mail' },
      { now: START, newId },
    )
    const fixture = setup(pinned.state, { work: base.work, life: base.life })
    const mail = fixture.host.addTab({ url: 'https://mail.example/' })
    fixture.host.addGroup({
      title: 'Work',
      color: 'blue',
      tabIds: [mail.id],
    })
    await fixture.reconciler.reconcile()

    fixture.host.updateTab(mail.id, {
      url: 'https://mail.example/thread/7',
      status: 'complete',
    })
    await fixture.reconciler.handleTabEvent(lastEvent(fixture.host))

    const session = await fixture.session.read()
    expect(session.tabLinks[String(mail.id)]).toBe(pinned.item.id)
    expect(session.unread).toEqual([mail.id])
    const item = (await fixture.store.read()).items.byId[pinned.item.id]
    expect(item.data).toMatchObject({ url: 'https://mail.example/' })
  })

  it('unlinks a closed tab', async () => {
    const base = baseState()
    const pinned = pin(
      base.state,
      base.work.id,
      { url: 'https://mail.example/', savedTitle: 'Mail' },
      { now: START, newId },
    )
    const fixture = setup(pinned.state, { work: base.work, life: base.life })
    const mail = fixture.host.addTab({ url: 'https://mail.example/' })
    fixture.host.addGroup({ title: 'Work', color: 'blue', tabIds: [mail.id] })
    await fixture.reconciler.reconcile()

    fixture.host.removeTab(mail.id)
    await fixture.reconciler.handleTabEvent(lastEvent(fixture.host))

    expect((await fixture.session.read()).tabLinks).toEqual({})
  })
})

describe('agent session groups', () => {
  it('never adopts, collapses, archives or discards them', async () => {
    const fixture = setup()
    const agentTab = fixture.host.addTab({ url: 'https://agent.example/' })
    const agentGroup = fixture.host.addGroup({
      title: 'claude-code/foo',
      color: 'grey',
      tabIds: [agentTab.id],
    })
    const workTab = fixture.host.addTab({ url: 'https://work.example/' })
    fixture.host.addGroup({
      title: 'Work',
      color: 'blue',
      tabIds: [workTab.id],
    })
    await fixture.reconciler.reconcile()

    // Adopt leaves the agent's own tab in the agent group.
    await fixture.reconciler.handleTabEvent({
      type: 'created',
      tab: { ...agentTab },
    })
    expect(fixture.host.tab(agentTab.id)?.groupId).toBe(agentGroup.id)

    await fixture.reconciler.switchSpace(fixture.life.id)
    expect(fixture.host.group(agentGroup.id)?.collapsed).toBe(false)

    fixture.clock.now = START + 13 * HOUR
    await fixture.reconciler.runArchiveAlarm()
    expect(fixture.host.tab(agentTab.id)).toBeDefined()
    const archived = (await fixture.store.read()).archive
    expect(
      archived.some((entry) =>
        entry.item.data.kind === 'tab'
          ? entry.item.data.url === 'https://agent.example/'
          : false,
      ),
    ).toBe(false)

    await fixture.session.write({
      spaceActiveAt: { [fixture.work.id]: START, [fixture.life.id]: START },
    })
    await fixture.reconciler.runDiscardAlarm()
    expect(fixture.host.tab(agentTab.id)?.discarded).toBe(false)
  })
})

describe('archive alarm', () => {
  it('archives a stale today tab and skips an audible one', async () => {
    const fixture = setup()
    const stale = fixture.host.addTab({ url: 'https://stale.example/' })
    const audible = fixture.host.addTab({
      url: 'https://radio.example/',
      audible: true,
    })
    const current = fixture.host.addTab({
      url: 'https://current.example/',
      active: true,
    })
    fixture.host.addGroup({
      title: 'Work',
      color: 'blue',
      tabIds: [stale.id, audible.id, current.id],
    })
    await fixture.reconciler.reconcile()

    fixture.clock.now = START + 13 * HOUR
    await fixture.reconciler.runArchiveAlarm()

    expect(fixture.host.tab(stale.id)).toBeUndefined()
    expect(fixture.host.tab(audible.id)).toBeDefined()
    expect(fixture.host.tab(current.id)).toBeDefined()
    const archive = (await fixture.store.read()).archive
    expect(archive).toHaveLength(1)
    expect(archive[0]).toMatchObject({
      reason: 'auto',
      spaceId: fixture.work.id,
    })
    expect(archive[0].item.data).toMatchObject({
      url: 'https://stale.example/',
    })
  })

  it('does nothing when auto archive is off', async () => {
    const fixture = setup()
    const stale = fixture.host.addTab({ url: 'https://stale.example/' })
    fixture.host.addGroup({ title: 'Work', color: 'blue', tabIds: [stale.id] })
    await fixture.reconciler.reconcile()
    const state = await fixture.store.read()
    await fixture.store.write({
      ...state,
      settings: { ...state.settings, autoArchiveAfter: 'never' },
    })

    fixture.clock.now = START + 30 * 24 * HOUR
    await fixture.reconciler.runArchiveAlarm()

    expect(fixture.host.tab(stale.id)).toBeDefined()
  })
})

describe('discard alarm', () => {
  it('discards tabs of an inactive space but keeps a drifted pinned tab', async () => {
    const base = baseState()
    const pinned = pin(
      base.state,
      base.life.id,
      { url: 'https://mail.example/', savedTitle: 'Mail' },
      { now: START, newId },
    )
    const fixture = setup(pinned.state, { work: base.work, life: base.life })
    const drifted = fixture.host.addTab({ url: 'https://mail.example/' })
    const idle = fixture.host.addTab({ url: 'https://idle.example/' })
    const audible = fixture.host.addTab({
      url: 'https://radio.example/',
      audible: true,
    })
    fixture.host.addGroup({
      title: 'Life',
      color: 'green',
      tabIds: [drifted.id, idle.id, audible.id],
    })
    const workTab = fixture.host.addTab({ url: 'https://work.example/' })
    fixture.host.addGroup({
      title: 'Work',
      color: 'blue',
      tabIds: [workTab.id],
    })
    await fixture.reconciler.reconcile()
    fixture.host.updateTab(drifted.id, { url: 'https://mail.example/thread/7' })

    fixture.clock.now = START + 31 * 60_000
    await fixture.reconciler.runDiscardAlarm()

    expect(fixture.host.tab(idle.id)?.discarded).toBe(true)
    expect(fixture.host.tab(drifted.id)?.discarded).toBe(false)
    expect(fixture.host.tab(audible.id)?.discarded).toBe(false)
    expect(fixture.host.tab(workTab.id)?.discarded).toBe(false)
  })
})

describe('space lifecycle', () => {
  it('renames the matching group and ungroups on delete', async () => {
    const fixture = setup()
    const tab = fixture.host.addTab({ url: 'https://work.example/' })
    const group = fixture.host.addGroup({
      title: 'Work',
      color: 'blue',
      tabIds: [tab.id],
    })
    await fixture.reconciler.reconcile()

    await fixture.reconciler.updateSpaceEverywhere({
      spaceId: fixture.work.id,
      name: 'Deep Work',
      color: 'purple',
    })
    expect(fixture.host.group(group.id)).toMatchObject({
      title: 'Deep Work',
      color: 'purple',
    })

    await fixture.reconciler.deleteSpaceEverywhere(fixture.work.id)
    expect(fixture.host.tab(tab.id)?.groupId).toBe(NO_GROUP)
    const state = await fixture.store.read()
    expect(state.spaces.order).toEqual([fixture.life.id])
    expect(state.activeSpaceId).toBe(fixture.life.id)
  })
})
