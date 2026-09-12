import { describe, expect, test } from 'bun:test'
import { type DragSource, type DropTarget, planDrop } from './drop-plan'

const APPEND = Number.MAX_SAFE_INTEGER

const todayRow: DragSource = {
  zone: 'today',
  tabId: 7,
  url: 'https://a.test/',
  title: 'A',
  kind: 'tab',
}
const pinnedRow: DragSource = {
  zone: 'pinned',
  itemId: 'p1',
  url: 'https://b.test/',
  title: 'B',
  kind: 'tab',
}
const pinnedFolder: DragSource = {
  zone: 'pinned',
  itemId: 'f1',
  kind: 'folder',
}
const essentialTile: DragSource = {
  zone: 'essentials',
  itemId: 'e1',
  url: 'https://c.test/',
  title: 'C',
  kind: 'tab',
}

const pinnedRoot: DropTarget = { zone: 'pinned', parentId: 'pinned-root' }
const folderTarget: DropTarget = { zone: 'pinned', parentId: 'f1' }
const essentialsRoot: DropTarget = {
  zone: 'essentials',
  parentId: 'essentials-root',
}
const todayZone: DropTarget = { zone: 'today' }

describe('planDrop', () => {
  test('reorders within essentials', () => {
    expect(planDrop(essentialTile, { ...essentialsRoot, index: 2 })).toEqual([
      {
        type: 'moveItem',
        itemId: 'e1',
        parentId: 'essentials-root',
        index: 2,
      },
    ])
  })

  test('reorders within pinned at the drop index', () => {
    expect(planDrop(pinnedRow, { ...pinnedRoot, index: 1 })).toEqual([
      { type: 'moveItem', itemId: 'p1', parentId: 'pinned-root', index: 1 },
    ])
  })

  test('drops onto a folder row as its last child', () => {
    expect(planDrop(pinnedRow, folderTarget)).toEqual([
      { type: 'moveItem', itemId: 'p1', parentId: 'f1', index: APPEND },
    ])
  })

  test('moves a folder out of a folder', () => {
    expect(planDrop(pinnedFolder, { ...pinnedRoot, index: 0 })).toEqual([
      { type: 'moveItem', itemId: 'f1', parentId: 'pinned-root', index: 0 },
    ])
  })

  test('today into pinned pins at the drop index', () => {
    expect(planDrop(todayRow, { ...pinnedRoot, index: 3 })).toEqual([
      { type: 'pinTab', tabId: 7, parentId: 'pinned-root', index: 3 },
    ])
  })

  test('today into essentials adds an essential', () => {
    expect(planDrop(todayRow, essentialsRoot)).toEqual([
      {
        type: 'addEssential',
        tabId: 7,
        url: 'https://a.test/',
        title: 'A',
      },
    ])
  })

  test('pinned into today unpins', () => {
    expect(planDrop(pinnedRow, todayZone)).toEqual([
      { type: 'unpinItem', itemId: 'p1' },
    ])
  })

  test('pinned into essentials adds an essential and keeps the pin', () => {
    expect(planDrop(pinnedRow, essentialsRoot)).toEqual([
      {
        type: 'addEssential',
        tabId: undefined,
        url: 'https://b.test/',
        title: 'B',
      },
    ])
  })

  test('essential into pinned pins a copy and keeps the tile', () => {
    expect(planDrop(essentialTile, { ...pinnedRoot, index: 0 })).toEqual([
      {
        type: 'pinTab',
        url: 'https://c.test/',
        title: 'C',
        parentId: 'pinned-root',
        index: 0,
      },
    ])
  })

  test('today rows never reorder among themselves', () => {
    expect(planDrop(todayRow, todayZone)).toEqual([])
  })

  test('an essential dropped back on today changes nothing', () => {
    expect(planDrop(essentialTile, todayZone)).toEqual([])
  })

  test('a folder cannot become an essential', () => {
    expect(planDrop(pinnedFolder, essentialsRoot)).toEqual([])
  })

  test('a pinned target without a parent is ignored', () => {
    expect(planDrop(todayRow, { zone: 'pinned' })).toEqual([])
  })
})
