import { beforeEach, describe, expect, it, mock } from 'bun:test'

/**
 * `ensureMigrated` against a storage adapter that can be made to fail. A
 * migration that failed must never be remembered as done: the callers that
 * would otherwise write against a half-migrated document have to see it.
 */

interface FakeItem {
  key: string
  fallback: unknown
}

const values = new Map<string, unknown>()
const reads: string[] = []
const writes: string[] = []
/** Keys whose read rejects until cleared. */
const failingReads = new Set<string>()
/** Keys whose write rejects until cleared. */
const failingWrites = new Set<string>()

function defineItem(key: string, options?: { fallback?: unknown }) {
  const item: FakeItem = { key, fallback: options?.fallback }
  return {
    async getValue() {
      reads.push(key)
      if (failingReads.has(key)) throw new Error(`read failed: ${key}`)
      return values.has(key) ? values.get(key) : item.fallback
    },
    async setValue(value: unknown) {
      writes.push(key)
      if (failingWrites.has(key)) throw new Error(`write failed: ${key}`)
      values.set(key, value)
    },
    watch() {
      return () => undefined
    },
  }
}

mock.module('@wxt-dev/storage', () => ({
  storage: {
    defineItem,
    async removeItems(keys: string[]) {
      for (const key of keys) values.delete(key)
    },
  },
}))

mock.module('@/lib/sentry/sentry', () => ({
  sentry: { captureException: () => undefined },
}))

const VERSION_KEY = 'local:sidebar:schemaVersion'

const { ensureMigrated, resetMigrationForTests } = await import('./storage')

beforeEach(() => {
  values.clear()
  reads.length = 0
  writes.length = 0
  failingReads.clear()
  failingWrites.clear()
  resetMigrationForTests()
})

describe('ensureMigrated', () => {
  it('reports the failure and retries on the next call', async () => {
    failingReads.add(VERSION_KEY)

    await expect(ensureMigrated()).rejects.toThrow('read failed')
    // Nothing was written against a document that was never migrated.
    expect(writes).toEqual([])

    failingReads.clear()
    await ensureMigrated()

    expect(values.get(VERSION_KEY)).toBe(2)
  })

  it('gives every concurrent caller the same failure from one attempt', async () => {
    failingReads.add(VERSION_KEY)

    const results = await Promise.allSettled([
      ensureMigrated(),
      ensureMigrated(),
      ensureMigrated(),
    ])

    expect(results.map((result) => result.status)).toEqual([
      'rejected',
      'rejected',
      'rejected',
    ])
    expect(reads.filter((key) => key === VERSION_KEY)).toHaveLength(1)
  })

  it('shares one in-flight attempt between concurrent callers', async () => {
    await Promise.all([ensureMigrated(), ensureMigrated()])

    expect(reads.filter((key) => key === VERSION_KEY)).toHaveLength(1)
    expect(values.get(VERSION_KEY)).toBe(2)
  })

  it('runs migration once when it succeeded', async () => {
    await ensureMigrated()
    reads.length = 0

    await ensureMigrated()

    expect(reads).toEqual([])
  })

  it('keeps existing data and the old version after a partial write', async () => {
    const archive = [{ keep: true }]
    values.set(VERSION_KEY, 1)
    values.set('local:sidebar:archive', archive)
    failingWrites.add(VERSION_KEY)

    await expect(ensureMigrated()).rejects.toThrow('write failed')

    // The stamp is written last, so a half-applied migration cannot look done.
    expect(values.get(VERSION_KEY)).toBe(1)
    expect(values.get('local:sidebar:archive')).toEqual(archive)

    failingWrites.clear()
    await ensureMigrated()

    expect(values.get(VERSION_KEY)).toBe(2)
    expect(values.get('local:sidebar:archive')).toEqual(archive)
  })
})
