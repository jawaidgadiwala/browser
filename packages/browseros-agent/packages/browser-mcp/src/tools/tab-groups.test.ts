import { describe, expect, it } from 'bun:test'
import type { BrowserSession } from '@browseros/browser-core/core/session'
import { executeTool } from './framework'
import { isAgentGroupTitle, mayMutateGroup, tab_groups } from './tab-groups'

const groups = [
  {
    groupId: 'group-agent',
    windowId: 1,
    title: 'claude-code/invoice',
    color: 'blue',
    collapsed: false,
    tabIds: [11],
  },
  {
    groupId: 'group-user',
    windowId: 1,
    title: 'Work',
    color: 'green',
    collapsed: false,
    tabIds: [22],
  },
]

function fakeSession() {
  const calls: Array<{ method: string; params: unknown }> = []
  const session = {
    cdp: async (method: string, params: unknown) => {
      calls.push({ method, params })
      if (method === 'Browser.getTabGroups') return { groups }
      if (method === 'Browser.updateTabGroup') return { group: groups[1] }
      return {}
    },
    pages: {
      list: async () => [],
      getInfo: (pageId: number) =>
        pageId === 11
          ? { tabId: 11, groupId: 'group-agent' }
          : { tabId: 22, groupId: 'group-user' },
      resolveTabIds: async (tabIds: number[]) =>
        new Map(tabIds.map((tabId) => [tabId, tabId])),
    },
  } as unknown as BrowserSession
  return { session, calls }
}

function textOf(result: Awaited<ReturnType<typeof executeTool>>) {
  return result.content
    .filter(
      (item): item is { type: 'text'; text: string } =>
        item.type === 'text' && typeof item.text === 'string',
    )
    .map((item) => item.text)
    .join('\n')
}

describe('agent tab-group title predicate', () => {
  it('matches agent-session titles', () => {
    for (const title of [
      'claude-code/invoice',
      'codex/agile-alpaca',
      'browseros/book-a-flight',
      'gpt4/task',
      'a/b',
      'claude-code/Work Notes',
      'claude-code/nested/label',
    ]) {
      expect(isAgentGroupTitle(title)).toBe(true)
    }
  })

  it('rejects user titles', () => {
    for (const title of [
      '',
      'Work',
      'Personal',
      'Work/Projects',
      'claude_code/invoice',
      'Claude-Code/invoice',
      '-claude/invoice',
      '/invoice',
      'claude code/invoice',
      'claude-code',
    ]) {
      expect(isAgentGroupTitle(title)).toBe(false)
    }
  })

  it('allows agent groups and refuses user groups', () => {
    expect(mayMutateGroup('claude-code/invoice', true, false)).toBe(true)
    expect(mayMutateGroup('Work', true, false)).toBe(false)
  })

  it('yields to force and to the disabled flag', () => {
    expect(mayMutateGroup('Work', true, true)).toBe(true)
    expect(mayMutateGroup('Work', false, false)).toBe(true)
  })
})

describe('tab_groups user-group guard', () => {
  it('reports ownership on list', async () => {
    const { session } = fakeSession()
    const result = await executeTool(
      tab_groups,
      { action: 'list' },
      { session },
    )
    const structured = result.structuredContent as {
      groups: Array<{ groupId: string; ownedByAgent: boolean }>
    }
    expect(structured.groups.map((group) => group.ownedByAgent)).toEqual([
      true,
      false,
    ])
  })

  it('refuses closing a user group', async () => {
    const { session, calls } = fakeSession()
    const result = await executeTool(
      tab_groups,
      { action: 'close', groupId: 'group-user' },
      { session },
    )
    expect(result.isError).toBe(true)
    expect(textOf(result)).toBe(
      "Group 'Work' belongs to the user. Pass force=true to modify it.",
    )
    expect(calls.some((call) => call.method === 'Browser.closeTabGroup')).toBe(
      false,
    )
  })

  it('refuses ungrouping pages out of a user group', async () => {
    const { session, calls } = fakeSession()
    const result = await executeTool(
      tab_groups,
      { action: 'ungroup', pages: [22] },
      { session },
    )
    expect(result.isError).toBe(true)
    expect(
      calls.some((call) => call.method === 'Browser.removeTabsFromGroup'),
    ).toBe(false)
  })

  it('refuses renaming a user group but allows collapsing it', async () => {
    const { session } = fakeSession()
    const renamed = await executeTool(
      tab_groups,
      { action: 'update', groupId: 'group-user', title: 'taken' },
      { session },
    )
    expect(renamed.isError).toBe(true)

    const collapsed = await executeTool(
      tab_groups,
      { action: 'update', groupId: 'group-user', collapsed: true },
      { session },
    )
    expect(collapsed.isError).toBeFalsy()
  })

  it('allows closing an agent group', async () => {
    const { session, calls } = fakeSession()
    const result = await executeTool(
      tab_groups,
      { action: 'close', groupId: 'group-agent' },
      { session },
    )
    expect(result.isError).toBeFalsy()
    expect(calls.some((call) => call.method === 'Browser.closeTabGroup')).toBe(
      true,
    )
  })

  it('allows closing a user group with force', async () => {
    const { session, calls } = fakeSession()
    const result = await executeTool(
      tab_groups,
      { action: 'close', groupId: 'group-user', force: true },
      { session },
    )
    expect(result.isError).toBeFalsy()
    expect(calls.some((call) => call.method === 'Browser.closeTabGroup')).toBe(
      true,
    )
  })

  it('allows closing a user group when the flag is off', async () => {
    const { session, calls } = fakeSession()
    const result = await executeTool(
      tab_groups,
      { action: 'close', groupId: 'group-user' },
      { session, protectUserTabGroups: false },
    )
    expect(result.isError).toBeFalsy()
    expect(calls.some((call) => call.method === 'Browser.closeTabGroup')).toBe(
      true,
    )
  })
})
