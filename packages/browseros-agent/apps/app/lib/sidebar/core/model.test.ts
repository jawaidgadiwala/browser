import { beforeEach, describe, expect, it } from 'bun:test'
import {
  addEssential,
  archiveItem,
  createFolder,
  createInitialState,
  createItem,
  createSpace,
  deleteSpace,
  ensureSpaceContainers,
  moveItem,
  moveSpace,
  pin,
  removeEssential,
  removeItem,
  restore,
  setExpansion,
  tidy,
  unpin,
  updateSpace,
} from './model'
import type { SidebarState } from './types'

let counter = 0
const ids = () => {
  counter += 1
  return `id${counter}`
}
const opts = () => ({ now: 1000, newId: ids })

beforeEach(() => {
  counter = 0
})

function withSpaces(names: string[]): { state: SidebarState; ids: string[] } {
  let state = createInitialState(opts())
  const spaceIds: string[] = []
  for (const name of names) {
    const result = createSpace(state, { name, color: 'blue' }, opts())
    state = result.state
    state = { ...state, activeSpaceId: result.space.id }
    spaceIds.push(result.space.id)
  }
  return { state, ids: spaceIds }
}

describe('createInitialState', () => {
  it('has one essentials root and nothing else', () => {
    const state = createInitialState(opts())
    expect(state.spaces.order).toEqual([])
    expect(Object.keys(state.items.byId)).toHaveLength(1)
    expect(state.items.byId[state.items.roots.essentials].data).toMatchObject({
      kind: 'container',
      role: 'essentials',
    })
  })
})

describe('spaces', () => {
  it('inserts a new space right after the active one', () => {
    const { state, ids: spaceIds } = withSpaces(['a', 'b'])
    const middle = createSpace(
      { ...state, activeSpaceId: spaceIds[0] },
      { name: 'c', color: 'red' },
      opts(),
    )
    expect(middle.state.spaces.order).toEqual([
      spaceIds[0],
      middle.space.id,
      spaceIds[1],
    ])
  })

  it('appends when nothing is active', () => {
    const { state, ids: spaceIds } = withSpaces(['a'])
    const result = createSpace(
      { ...state, activeSpaceId: null },
      { name: 'b', color: 'red' },
      opts(),
    )
    expect(result.state.spaces.order).toEqual([spaceIds[0], result.space.id])
  })

  it('creates pinned and today containers for every space', () => {
    const { state, ids: spaceIds } = withSpaces(['a'])
    const space = state.spaces.byId[spaceIds[0]]
    expect(state.items.byId[space.containers.pinned].data).toMatchObject({
      kind: 'container',
      role: 'pinned',
      spaceId: space.id,
    })
    expect(state.items.byId[space.containers.today].data).toMatchObject({
      role: 'today',
    })
  })

  it('updates fields without touching containers', () => {
    const { state, ids: spaceIds } = withSpaces(['a'])
    const next = updateSpace(state, spaceIds[0], { name: 'z', icon: '🧠' })
    expect(next.spaces.byId[spaceIds[0]].name).toBe('z')
    expect(next.spaces.byId[spaceIds[0]].containers).toEqual(
      state.spaces.byId[spaceIds[0]].containers,
    )
  })

  it('reorders', () => {
    const { state, ids: spaceIds } = withSpaces(['a', 'b', 'c'])
    expect(moveSpace(state, spaceIds[2], 0).spaces.order).toEqual([
      spaceIds[2],
      spaceIds[0],
      spaceIds[1],
    ])
    expect(moveSpace(state, 'missing', 0).spaces.order).toEqual(
      state.spaces.order,
    )
  })

  it('archives pinned nodes when deleting and moves the active id', () => {
    const { state, ids: spaceIds } = withSpaces(['a', 'b'])
    const pinned = pin(
      state,
      spaceIds[0],
      { url: 'https://x.test/', savedTitle: 'X' },
      opts(),
    )
    const next = deleteSpace(
      { ...pinned.state, activeSpaceId: spaceIds[0] },
      spaceIds[0],
      opts(),
    )
    expect(next.spaces.order).toEqual([spaceIds[1]])
    expect(next.activeSpaceId).toBe(spaceIds[1])
    expect(next.archive).toHaveLength(1)
    expect(next.archive[0].reason).toBe('spaceDeleted')
    expect(next.archive[0].spaceId).toBe(spaceIds[0])
    expect(next.items.byId[pinned.item.id]).toBeUndefined()
  })

  it('reconciles containers for spaces written without them', () => {
    const { state, ids: spaceIds } = withSpaces(['a'])
    const stripped: SidebarState = {
      ...state,
      items: {
        ...state.items,
        byId: {
          [state.items.roots.essentials]:
            state.items.byId[state.items.roots.essentials],
        },
      },
    }
    const fixed = ensureSpaceContainers(stripped, opts())
    const space = fixed.spaces.byId[spaceIds[0]]
    expect(fixed.items.byId[space.containers.pinned]).toBeDefined()
    expect(ensureSpaceContainers(fixed, opts())).toBe(fixed)
  })

  it('drops containers whose space is gone', () => {
    const { state, ids: spaceIds } = withSpaces(['a', 'b'])
    const orphaned = state.spaces.byId[spaceIds[1]].containers.pinned
    const without: SidebarState = {
      ...state,
      spaces: {
        order: [spaceIds[0]],
        byId: { [spaceIds[0]]: state.spaces.byId[spaceIds[0]] },
      },
    }
    expect(
      ensureSpaceContainers(without, opts()).items.byId[orphaned],
    ).toBeUndefined()
  })
})

describe('items', () => {
  it('creates, moves and removes subtrees', () => {
    const { state, ids: spaceIds } = withSpaces(['a'])
    const root = state.spaces.byId[spaceIds[0]].containers.pinned
    const folder = createFolder(state, root, 'Docs', opts())
    const tab = createItem(
      folder.state,
      {
        parentId: root,
        index: 0,
        data: {
          kind: 'tab',
          url: 'https://a.test',
          savedTitle: 'A',
          lastActiveAt: 0,
        },
      },
      opts(),
    )
    expect(tab.state.items.byId[root].children).toEqual([
      tab.item.id,
      folder.item.id,
    ])

    const moved = moveItem(tab.state, tab.item.id, folder.item.id, 0)
    expect(moved.items.byId[folder.item.id].children).toEqual([tab.item.id])
    expect(moved.items.byId[root].children).toEqual([folder.item.id])

    const gone = removeItem(moved, folder.item.id)
    expect(gone.items.byId[tab.item.id]).toBeUndefined()
    expect(gone.items.byId[root].children).toEqual([])
  })

  it('refuses to move a node into its own subtree', () => {
    const { state, ids: spaceIds } = withSpaces(['a'])
    const root = state.spaces.byId[spaceIds[0]].containers.pinned
    const outer = createFolder(state, root, 'Outer', opts())
    const inner = createFolder(outer.state, outer.item.id, 'Inner', opts())
    expect(moveItem(inner.state, outer.item.id, inner.item.id, 0)).toBe(
      inner.state,
    )
  })

  it('pins with a canonical snapshot and unpins', () => {
    const { state, ids: spaceIds } = withSpaces(['a'])
    const pinned = pin(
      state,
      spaceIds[0],
      { url: 'https://x.test/a', savedTitle: 'X', favicon: 'f' },
      opts(),
    )
    expect(pinned.item.data).toMatchObject({
      kind: 'tab',
      url: 'https://x.test/a',
      savedTitle: 'X',
      favicon: 'f',
      lastActiveAt: 1000,
    })
    expect(
      pinned.state.items.byId[state.spaces.byId[spaceIds[0]].containers.pinned]
        .children,
    ).toEqual([pinned.item.id])
    expect(
      Object.keys(unpin(pinned.state, pinned.item.id).items.byId),
    ).not.toContain(pinned.item.id)
  })

  it('caps essentials at the settings max', () => {
    let state = createInitialState(opts())
    state = { ...state, settings: { ...state.settings, essentialsMax: 2 } }
    for (let i = 0; i < 2; i += 1) {
      state = addEssential(
        state,
        { url: `https://${i}.test`, savedTitle: '' },
        opts(),
      ).state
    }
    const overflow = addEssential(
      state,
      { url: 'https://x.test', savedTitle: '' },
      opts(),
    )
    expect(overflow.item).toBeNull()
    expect(overflow.state).toBe(state)

    const first = state.items.byId[state.items.roots.essentials].children[0]
    expect(
      removeEssential(state, first).items.byId[state.items.roots.essentials]
        .children,
    ).toHaveLength(1)
  })

  it('sets folder expansion tri-state', () => {
    const { state, ids: spaceIds } = withSpaces(['a'])
    const root = state.spaces.byId[spaceIds[0]].containers.pinned
    const folder = createFolder(state, root, 'F', opts())
    for (const expansion of ['collapsed', 'peeked', 'expanded'] as const) {
      const next = setExpansion(folder.state, folder.item.id, expansion)
      expect(next.items.byId[folder.item.id].data).toMatchObject({ expansion })
    }
  })
})

describe('archive', () => {
  it('archives a subtree and restores it under its container', () => {
    const { state, ids: spaceIds } = withSpaces(['a'])
    const root = state.spaces.byId[spaceIds[0]].containers.pinned
    const folder = createFolder(state, root, 'F', opts())
    const child = createItem(
      folder.state,
      {
        parentId: folder.item.id,
        data: {
          kind: 'tab',
          url: 'https://c.test',
          savedTitle: 'C',
          lastActiveAt: 0,
        },
      },
      opts(),
    )

    const archived = archiveItem(
      child.state,
      folder.item.id,
      'manual',
      'test',
      opts(),
    )
    expect(archived.archive).toHaveLength(1)
    expect(archived.archive[0].children).toHaveLength(1)
    expect(archived.items.byId[child.item.id]).toBeUndefined()

    const restored = restore(archived, 1000, folder.item.id)
    expect(restored.archive).toHaveLength(0)
    expect(restored.items.byId[root].children).toEqual([folder.item.id])
    expect(restored.items.byId[child.item.id]).toBeDefined()
  })

  it('tidy archives today snapshots without creating live nodes', () => {
    const { state, ids: spaceIds } = withSpaces(['a'])
    const before = Object.keys(state.items.byId).length
    const next = tidy(
      state,
      spaceIds[0],
      [
        { url: 'https://1.test', savedTitle: '1' },
        { url: 'https://2.test', savedTitle: '2' },
      ],
      'manual',
      opts(),
    )
    expect(next.archive).toHaveLength(2)
    expect(next.archive[0].source).toBe('tidy')
    expect(Object.keys(next.items.byId)).toHaveLength(before)
    expect(tidy(state, spaceIds[0], [], 'manual', opts())).toBe(state)
  })
})

describe('move rules across zones', () => {
  it('refuses to store anything in a today container', () => {
    const { state: base, ids: spaceIds } = withSpaces(['Work'])
    const space = base.spaces.byId[spaceIds[0]]
    const pinned = pin(
      base,
      space.id,
      { url: 'https://a.test/', savedTitle: 'A' },
      opts(),
    )
    const moved = moveItem(
      pinned.state,
      pinned.item.id,
      space.containers.today,
      0,
    )
    expect(moved).toBe(pinned.state)
  })

  it('moves a pinned tab into the essentials container', () => {
    const { state: base, ids: spaceIds } = withSpaces(['Work'])
    const pinned = pin(
      base,
      spaceIds[0],
      { url: 'https://a.test/', savedTitle: 'A' },
      opts(),
    )
    const root = base.items.roots.essentials
    const moved = moveItem(pinned.state, pinned.item.id, root, 0)
    expect(moved.items.byId[root].children).toEqual([pinned.item.id])
  })

  it('never puts a folder in essentials', () => {
    const { state: base, ids: spaceIds } = withSpaces(['Work'])
    const space = base.spaces.byId[spaceIds[0]]
    const folder = createFolder(base, space.containers.pinned, 'Docs', opts())
    const root = base.items.roots.essentials
    expect(moveItem(folder.state, folder.item.id, root, 0)).toBe(folder.state)
  })

  it('refuses a new essential once the grid is full', () => {
    let state = createInitialState(opts())
    state = { ...state, settings: { ...state.settings, essentialsMax: 2 } }
    for (const host of ['a', 'b']) {
      const added = addEssential(
        state,
        { url: `https://${host}.test/`, savedTitle: host },
        opts(),
      )
      state = added.state
    }
    const overflow = addEssential(
      state,
      { url: 'https://c.test/', savedTitle: 'c' },
      opts(),
    )
    expect(overflow.item).toBeNull()
    expect(overflow.state).toBe(state)
  })

  it('blocks a move into a full essentials grid but still reorders it', () => {
    let state = createInitialState(opts())
    state = { ...state, settings: { ...state.settings, essentialsMax: 2 } }
    const root = state.items.roots.essentials
    for (const host of ['a', 'b']) {
      state = addEssential(
        state,
        { url: `https://${host}.test/`, savedTitle: host },
        opts(),
      ).state
    }
    const spaced = createSpace(state, { name: 'Work', color: 'blue' }, opts())
    state = { ...spaced.state, activeSpaceId: spaced.space.id }
    const pinned = pin(
      state,
      spaced.space.id,
      { url: 'https://c.test/', savedTitle: 'c' },
      opts(),
    )
    expect(moveItem(pinned.state, pinned.item.id, root, 0)).toBe(pinned.state)

    const [first, second] = state.items.byId[root].children
    const reordered = moveItem(state, second, root, 0)
    expect(reordered.items.byId[root].children).toEqual([second, first])
  })

  it('nests folders two deep and no further', () => {
    const { state: base, ids: spaceIds } = withSpaces(['Work'])
    const space = base.spaces.byId[spaceIds[0]]
    const top = createFolder(base, space.containers.pinned, 'Top', opts())
    const inner = createFolder(top.state, top.item.id, 'Inner', opts())
    expect(inner.item.parentId).toBe(top.item.id)
    expect(() =>
      createFolder(inner.state, inner.item.id, 'Deep', opts()),
    ).toThrow()
  })

  it('refuses to move a folder below the nesting cap', () => {
    const { state: base, ids: spaceIds } = withSpaces(['Work'])
    const space = base.spaces.byId[spaceIds[0]]
    const top = createFolder(base, space.containers.pinned, 'Top', opts())
    const inner = createFolder(top.state, top.item.id, 'Inner', opts())
    const other = createFolder(
      inner.state,
      space.containers.pinned,
      'Other',
      opts(),
    )
    expect(moveItem(other.state, other.item.id, inner.item.id, 0)).toBe(
      other.state,
    )
    const ok = moveItem(other.state, other.item.id, top.item.id, 0)
    expect(ok.items.byId[top.item.id].children).toContain(other.item.id)
  })

  it('lets a pinned tab live in a folder at the nesting cap', () => {
    const { state: base, ids: spaceIds } = withSpaces(['Work'])
    const space = base.spaces.byId[spaceIds[0]]
    const top = createFolder(base, space.containers.pinned, 'Top', opts())
    const inner = createFolder(top.state, top.item.id, 'Inner', opts())
    const pinned = pin(
      inner.state,
      space.id,
      { url: 'https://a.test/', savedTitle: 'A' },
      opts(),
    )
    const moved = moveItem(pinned.state, pinned.item.id, inner.item.id, 0)
    expect(moved.items.byId[inner.item.id].children).toEqual([pinned.item.id])
  })
})
