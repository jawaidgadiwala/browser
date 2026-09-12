import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { createHash } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  BUN_DIR,
  type BunStamp,
  bunBinaryPath,
  ensureBunBinaries,
  isStampCurrent,
  resolvePlatforms,
  stampPath,
} from './fetch-bun-binaries'

/**
 * The offline cache must be tied to the pinned version and to the bytes on
 * disk: a build that bumps `packageManager` may never ship the old runtime.
 * Downloads and extraction are faked, so nothing here touches the network.
 */

const ZIP_PREFIX = 'ZIP:'
const DARWIN = resolvePlatforms(['darwin-arm64'])[0]
const LINUX = resolvePlatforms(['linux-x64'])[0]

let root: string
let requested: string[]
let realSpawnSync: typeof Bun.spawnSync
let realFetch: typeof globalThis.fetch

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** The bytes the release ships for a platform at a version. */
function payload(asset: string, version: string): string {
  return `bun ${asset} ${version}`
}

function zipBytes(asset: string, version: string): Uint8Array {
  return new TextEncoder().encode(`${ZIP_PREFIX}${payload(asset, version)}`)
}

function pinVersion(version: string) {
  writeFileSync(
    join(root, 'package.json'),
    `${JSON.stringify({ packageManager: `bun@${version}` }, null, 2)}\n`,
  )
}

function readStamp(platform = DARWIN): BunStamp {
  return JSON.parse(
    readFileSync(stampPath(bunBinaryPath(platform, root)), 'utf-8'),
  ) as BunStamp
}

function installFakes() {
  realFetch = globalThis.fetch
  realSpawnSync = Bun.spawnSync

  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input)
    requested.push(url)
    if (url.endsWith('SHASUMS256.txt')) {
      const version = /bun-v([0-9.]+)\//.exec(url)?.[1] ?? '0.0.0'
      const lines = [DARWIN, LINUX].map(
        (platform) =>
          `${sha256(zipBytes(platform.asset, version))}  ${platform.asset}.zip`,
      )
      return new Response(`${lines.join('\n')}\n`, { status: 200 })
    }
    const match = /bun-v([0-9.]+)\/(.+)\.zip$/.exec(url)
    if (!match) return new Response('not found', { status: 404 })
    return new Response(zipBytes(match[2], match[1]), { status: 200 })
  }) as typeof globalThis.fetch

  // Stands in for `unzip`: writes <extractDir>/<asset>/bun from the zip body.
  Bun.spawnSync = ((args: string[]) => {
    const [, , , zipPath, , extractDir] = args
    const body = readFileSync(zipPath, 'utf-8').slice(ZIP_PREFIX.length)
    const asset = /\.(.+)\.zip$/.exec(zipPath)?.[1] ?? 'bun'
    mkdirSync(join(extractDir, asset), { recursive: true })
    writeFileSync(join(extractDir, asset, 'bun'), body)
    return {
      exitCode: 0,
      stderr: Buffer.from(''),
      stdout: Buffer.from(''),
    }
  }) as unknown as typeof Bun.spawnSync
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'bun-cache-'))
  requested = []
  pinVersion('1.2.3')
  installFakes()
})

afterEach(() => {
  globalThis.fetch = realFetch
  Bun.spawnSync = realSpawnSync
  rmSync(root, { force: true, recursive: true })
})

function zipRequests(): string[] {
  return requested.filter((url) => url.endsWith('.zip'))
}

describe('isStampCurrent', () => {
  const stamp: BunStamp = {
    version: '1.2.3',
    platform: DARWIN.id,
    asset: DARWIN.asset,
    binarySha: 'aa',
    zipSha: 'bb',
  }

  it('accepts a stamp for the same version, platform and zip', () => {
    expect(isStampCurrent(stamp, DARWIN, '1.2.3')).toBe(true)
    expect(isStampCurrent(stamp, DARWIN, '1.2.3', 'bb')).toBe(true)
  })

  it('rejects another version, platform or zip checksum', () => {
    expect(isStampCurrent(stamp, DARWIN, '1.2.4')).toBe(false)
    expect(isStampCurrent(stamp, LINUX, '1.2.3')).toBe(false)
    expect(isStampCurrent(stamp, DARWIN, '1.2.3', 'cc')).toBe(false)
    expect(isStampCurrent(null, DARWIN, '1.2.3')).toBe(false)
  })
})

describe('ensureBunBinaries', () => {
  it('downloads the pinned version and records it in the stamp', async () => {
    await ensureBunBinaries([DARWIN], { root, quiet: true })

    expect(readFileSync(bunBinaryPath(DARWIN, root), 'utf-8')).toBe(
      payload(DARWIN.asset, '1.2.3'),
    )
    expect(readStamp()).toMatchObject({
      version: '1.2.3',
      platform: DARWIN.id,
      asset: DARWIN.asset,
      binarySha: sha256(payload(DARWIN.asset, '1.2.3')),
    })
  })

  it('reuses the cache offline while the pin is unchanged', async () => {
    await ensureBunBinaries([DARWIN], { root, quiet: true })
    requested = []

    await ensureBunBinaries([DARWIN], { root, quiet: true })

    expect(requested).toEqual([])
  })

  it('re-fetches when the pinned version changes', async () => {
    await ensureBunBinaries([DARWIN], { root, quiet: true })
    pinVersion('1.2.4')
    requested = []

    await ensureBunBinaries([DARWIN], { root, quiet: true })

    expect(zipRequests()).toHaveLength(1)
    expect(readFileSync(bunBinaryPath(DARWIN, root), 'utf-8')).toBe(
      payload(DARWIN.asset, '1.2.4'),
    )
    expect(readStamp().version).toBe('1.2.4')
  })

  it('re-fetches when the metadata is missing', async () => {
    await ensureBunBinaries([DARWIN], { root, quiet: true })
    rmSync(stampPath(bunBinaryPath(DARWIN, root)))
    requested = []

    await ensureBunBinaries([DARWIN], { root, quiet: true })

    expect(zipRequests()).toHaveLength(1)
  })

  it('re-fetches when the metadata is malformed', async () => {
    await ensureBunBinaries([DARWIN], { root, quiet: true })
    writeFileSync(stampPath(bunBinaryPath(DARWIN, root)), '{ nope')
    requested = []

    await ensureBunBinaries([DARWIN], { root, quiet: true })

    expect(zipRequests()).toHaveLength(1)
    expect(readStamp().version).toBe('1.2.3')
  })

  it('re-fetches when a pre-metadata stamp is all that is cached', async () => {
    const binaryPath = bunBinaryPath(DARWIN, root)
    mkdirSync(join(root, BUN_DIR), { recursive: true })
    writeFileSync(binaryPath, 'stale old runtime')
    writeFileSync(`${binaryPath}.sha256`, 'old-release-hash\n')
    requested = []

    await ensureBunBinaries([DARWIN], { root, quiet: true })

    expect(zipRequests()).toHaveLength(1)
    expect(readFileSync(binaryPath, 'utf-8')).toBe(
      payload(DARWIN.asset, '1.2.3'),
    )
  })

  it('re-fetches when the cached executable was modified', async () => {
    await ensureBunBinaries([DARWIN], { root, quiet: true })
    writeFileSync(bunBinaryPath(DARWIN, root), 'tampered')
    requested = []

    await ensureBunBinaries([DARWIN], { root, quiet: true })

    expect(zipRequests()).toHaveLength(1)
    expect(readFileSync(bunBinaryPath(DARWIN, root), 'utf-8')).toBe(
      payload(DARWIN.asset, '1.2.3'),
    )
  })

  it('refreshes only the stale platform of a mixed cache', async () => {
    await ensureBunBinaries([DARWIN, LINUX], { root, quiet: true })
    const stale = stampPath(bunBinaryPath(LINUX, root))
    writeFileSync(
      stale,
      JSON.stringify({ ...readStamp(LINUX), version: '1.1.1' }),
    )
    requested = []

    await ensureBunBinaries([DARWIN, LINUX], { root, quiet: true })

    expect(zipRequests()).toEqual([
      expect.stringContaining(`${LINUX.asset}.zip`),
    ])
    expect(readStamp(LINUX).version).toBe('1.2.3')
    expect(readStamp(DARWIN).version).toBe('1.2.3')
  })
})
