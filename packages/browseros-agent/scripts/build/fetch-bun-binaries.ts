#!/usr/bin/env bun

/**
 * Downloads the bundled Bun runtime from the official oven-sh/bun GitHub
 * releases instead of the upstream private R2 bucket, so a product build needs
 * no R2 credentials. Binaries land in third_party/bun/ (gitignored) where
 * scripts/build/config/server-prod-resources.json picks them up as local rules.
 */

import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export const BUN_DIR = 'third_party/bun'

interface BunPlatform {
  /** Build target id (packages/build-server-tools targets.ts). */
  id: string
  /** Asset base name in the GitHub release, without .zip. */
  asset: string
  /** File name written into third_party/bun/. */
  file: string
}

export const BUN_PLATFORMS: BunPlatform[] = [
  {
    id: 'darwin-arm64',
    asset: 'bun-darwin-aarch64',
    file: 'bun-darwin-arm64',
  },
  { id: 'darwin-x64', asset: 'bun-darwin-x64', file: 'bun-darwin-x64' },
  { id: 'linux-arm64', asset: 'bun-linux-aarch64', file: 'bun-linux-arm64' },
  {
    id: 'linux-x64',
    asset: 'bun-linux-x64-baseline',
    file: 'bun-linux-x64-baseline',
  },
  {
    id: 'windows-x64',
    asset: 'bun-windows-x64-baseline',
    file: 'bun-windows-x64-baseline.exe',
  },
]

export function repoRoot(): string {
  return resolve(import.meta.dir, '../..')
}

export function bunBinaryPath(
  platform: BunPlatform,
  root = repoRoot(),
): string {
  return join(root, BUN_DIR, platform.file)
}

export function resolvePlatforms(only: string[]): BunPlatform[] {
  if (only.length === 0) {
    return BUN_PLATFORMS
  }
  return only.map((value) => {
    const name = value.trim()
    const platform = BUN_PLATFORMS.find(
      (candidate) =>
        candidate.id === name ||
        candidate.asset === name ||
        candidate.file === name,
    )
    if (!platform) {
      throw new Error(
        `Unknown platform: ${name}. Available: ${BUN_PLATFORMS.map((entry) => entry.id).join(', ')}`,
      )
    }
    return platform
  })
}

export async function readPinnedBunVersion(root = repoRoot()): Promise<string> {
  const raw = await readFile(join(root, 'package.json'), 'utf-8')
  const pkg = JSON.parse(raw) as {
    packageManager?: string
    engines?: { bun?: string }
  }
  const fromPackageManager = pkg.packageManager?.startsWith('bun@')
    ? pkg.packageManager.slice('bun@'.length)
    : undefined
  const version = fromPackageManager ?? pkg.engines?.bun
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(
      `Could not resolve a pinned Bun version from package.json (packageManager=${String(pkg.packageManager)}, engines.bun=${String(pkg.engines?.bun)})`,
    )
  }
  return version
}

function releaseBaseUrl(version: string): string {
  return `https://github.com/oven-sh/bun/releases/download/bun-v${version}`
}

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}): ${url}`)
  }
  return response
}

/** Maps asset zip name -> sha256, or null when the release ships no checksums. */
async function fetchChecksums(
  version: string,
): Promise<Map<string, string> | null> {
  const url = `${releaseBaseUrl(version)}/SHASUMS256.txt`
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) {
    return null
  }
  const checksums = new Map<string, string>()
  for (const line of (await response.text()).split('\n')) {
    const match = /^([0-9a-f]{64})\s+\*?(\S+)$/.exec(line.trim())
    if (match?.[1] && match[2]) {
      checksums.set(match[2], match[1])
    }
  }
  return checksums.size > 0 ? checksums : null
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function stampPath(binaryPath: string): string {
  return `${binaryPath}.sha256`
}

/** A binary is up to date when its stamp matches the expected zip checksum. */
async function isUpToDate(
  binaryPath: string,
  expectedZipSha: string | undefined,
): Promise<boolean> {
  if (!existsSync(binaryPath)) {
    return false
  }
  const info = await stat(binaryPath)
  if (info.size === 0) {
    return false
  }
  if (!expectedZipSha) {
    return true
  }
  try {
    return (
      (await readFile(stampPath(binaryPath), 'utf-8')).trim() === expectedZipSha
    )
  } catch {
    return false
  }
}

async function extractBunExecutable(
  zipPath: string,
  assetName: string,
  destination: string,
): Promise<void> {
  const extractDir = await mkdtemp(join(tmpdir(), 'bun-fetch-'))
  try {
    // The official zips contain <asset>/bun or <asset>/bun.exe.
    const unzip = Bun.spawnSync([
      'unzip',
      '-o',
      '-q',
      zipPath,
      '-d',
      extractDir,
    ])
    if (unzip.exitCode !== 0) {
      throw new Error(
        `unzip failed for ${assetName}: ${unzip.stderr.toString().trim()}`,
      )
    }
    const candidates = [
      join(extractDir, assetName, 'bun'),
      join(extractDir, assetName, 'bun.exe'),
    ]
    const found = candidates.find((candidate) => existsSync(candidate))
    if (!found) {
      throw new Error(`Bun executable not found in ${assetName}.zip`)
    }
    await mkdir(join(destination, '..'), { recursive: true })
    await rename(found, destination)
    await chmod(destination, 0o755)
  } finally {
    await rm(extractDir, { force: true, recursive: true })
  }
}

export async function ensureBunBinaries(
  platforms: BunPlatform[] = BUN_PLATFORMS,
  options: { root?: string; quiet?: boolean } = {},
): Promise<string[]> {
  const root = options.root ?? repoRoot()
  const log = (message: string) => {
    if (!options.quiet) {
      console.log(message)
    }
  }

  const version = await readPinnedBunVersion(root)
  const targetDir = join(root, BUN_DIR)
  await mkdir(targetDir, { recursive: true })

  // A stamped, non-empty binary is trusted as-is so repeat builds stay offline.
  const stamped = await Promise.all(
    platforms.map(async (platform) => {
      const binaryPath = bunBinaryPath(platform, root)
      return (
        (await isUpToDate(binaryPath, undefined)) &&
        existsSync(stampPath(binaryPath))
      )
    }),
  )
  if (stamped.every(Boolean)) {
    for (const platform of platforms) {
      log(`· ${platform.file} already present`)
    }
    return platforms.map((platform) => bunBinaryPath(platform, root))
  }

  const checksums = await fetchChecksums(version)
  if (!checksums) {
    log(
      `! SHASUMS256.txt unavailable for bun-v${version}; skipping verification`,
    )
  }

  const results: string[] = []
  for (const platform of platforms) {
    const binaryPath = bunBinaryPath(platform, root)
    const expected = checksums?.get(`${platform.asset}.zip`)
    if (await isUpToDate(binaryPath, expected)) {
      log(`· ${platform.file} already present`)
      results.push(binaryPath)
      continue
    }

    const url = `${releaseBaseUrl(version)}/${platform.asset}.zip`
    log(`↓ ${platform.asset}.zip (bun v${version})`)
    const bytes = new Uint8Array(await (await fetchOk(url)).arrayBuffer())
    const actual = sha256(bytes)
    if (expected && actual !== expected) {
      throw new Error(
        `SHA256 mismatch for ${platform.asset}.zip: expected ${expected}, got ${actual}`,
      )
    }

    const zipPath = join(targetDir, `.${platform.asset}.zip`)
    await writeFile(zipPath, bytes)
    try {
      await extractBunExecutable(zipPath, platform.asset, binaryPath)
    } finally {
      await rm(zipPath, { force: true })
    }
    await writeFile(stampPath(binaryPath), `${actual}\n`)
    log(`✓ ${platform.file}`)
    results.push(binaryPath)
  }

  return results
}

function parseOnly(argv: string[]): string[] {
  const only: string[] = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--only') {
      const value = argv[index + 1]
      if (!value) {
        throw new Error('--only requires a platform value')
      }
      only.push(...value.split(','))
      index += 1
    } else if (arg?.startsWith('--only=')) {
      only.push(...arg.slice('--only='.length).split(','))
    } else if (arg) {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return only
}

if (import.meta.main) {
  try {
    await ensureBunBinaries(resolvePlatforms(parseOnly(process.argv.slice(2))))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`\n✗ ${message}\n`)
    process.exit(1)
  }
}
