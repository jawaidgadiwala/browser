// Shared paths, ports and sidecar helpers for the personal daily-driver
// launcher. Mirrors tools/dev (Go) so the browser sees identical Chromium
// flags and the servers identical sidecar JSON, minus the hot-reload loop.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export const AGENT_ROOT = resolve(import.meta.dir, '..', '..')

// Prefer the rebranded, ad-hoc re-signed copy when it exists (see
// docs/personal/daily-driver.md, "App icon"); fall back to the stock bundle.
const BRANDED_BINARY = '/Applications/Browser.app/Contents/MacOS/BrowserOS'
const STOCK_BINARY = '/Applications/BrowserOS.app/Contents/MacOS/BrowserOS'
export const BROWSEROS_BINARY =
  process.env.BROWSEROS_PERSONAL_BINARY ||
  (existsSync(BRANDED_BINARY) ? BRANDED_BINARY : STOCK_BINARY)

// Product name of the personal build; mirrors apps/app/lib/personal/product.ts.
const PRODUCT_NAME = 'Browser'

const APP_SUPPORT = join(homedir(), 'Library', 'Application Support')

export const PROFILE_DIR =
  process.env.BROWSEROS_PERSONAL_PROFILE || join(APP_SUPPORT, PRODUCT_NAME)

/** Pre-rename locations, kept only so migrateLegacyDirs can move them once. */
const LEGACY_PROFILE_DIR = join(APP_SUPPORT, 'BrowserOS Personal')
const LEGACY_LOG_DIR = join(homedir(), 'Library', 'Logs', 'BrowserOS Personal')

export const LOG_DIR =
  process.env.BROWSEROS_PERSONAL_LOG_DIR ||
  join(homedir(), 'Library', 'Logs', PRODUCT_NAME)

// Server state (db, cache, installation.json). Kept separate from the dev
// loop's ~/.browseros-dev and from a released BrowserOS install's ~/.browseros.
export const BROWSEROS_STATE_DIR =
  process.env.BROWSEROS_PERSONAL_STATE_DIR ||
  join(homedir(), '.browseros-personal')

export const BROWSERCLAW_STATE_DIR =
  process.env.BROWSEROS_PERSONAL_CLAW_STATE_DIR ||
  join(homedir(), '.browserclaw-personal')

export const STATE_FILE = join(PROFILE_DIR, 'personal-launcher.json')

export const APP_DIST = join(AGENT_ROOT, 'apps/app/dist/chrome-mv3')
export const CLAW_DIST = join(AGENT_ROOT, 'apps/claw-app/dist/chrome-mv3')

export const CLAW_SERVER_BINARY = join(
  AGENT_ROOT,
  'target/release/browseros-claw-server-rs',
)

export interface PersonalPorts {
  cdp: number
  server: number
  extension: number
  claw: number
}

function port(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) {
    return fallback
  }
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be an integer port between 1 and 65535`)
  }
  return value
}

export function personalPorts(): PersonalPorts {
  return {
    cdp: port('BROWSEROS_PERSONAL_CDP_PORT', 9005),
    server: port('BROWSEROS_PERSONAL_SERVER_PORT', 9105),
    extension: port('BROWSEROS_PERSONAL_EXTENSION_PORT', 9305),
    claw: port('BROWSEROS_PERSONAL_CLAW_PORT', 9205),
  }
}

export function sidecarPath(name: string): string {
  return join(PROFILE_DIR, 'sidecars', `${name}.json`)
}

/** Writes the sidecar JSON consumed by the Bun and Rust server binaries. */
export function writeSidecarConfig(options: {
  path: string
  serverPort: number
  cdpPort: number
  resourcesDir: string
  executionDir: string
}): void {
  mkdirSync(dirname(options.path), { recursive: true })
  const config = {
    ports: {
      server: options.serverPort,
      cdp: options.cdpPort,
      proxy: options.serverPort,
    },
    directories: {
      resources: options.resourcesDir,
      execution: options.executionDir,
    },
    flags: { allow_remote_in_mcp: false },
    instance: {
      client_id: '',
      install_id: '',
      browseros_version: '',
      chromium_version: '',
    },
  }
  writeFileSync(options.path, `${JSON.stringify(config, null, 2)}\n`)
}

export interface LauncherState {
  startedAt: string
  ports: PersonalPorts
  profileDir: string
  pids: { browser?: number; server?: number; claw?: number }
}

export function readState(): LauncherState | null {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as LauncherState
  } catch {
    return null
  }
}

export function writeState(state: LauncherState): void {
  mkdirSync(dirname(STATE_FILE), { recursive: true })
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`)
}

/** Returns the full command line of a pid, or null when it is not running. */
export function processCommand(pid: number): string | null {
  const result = Bun.spawnSync(['ps', '-p', String(pid), '-o', 'command='])
  if (result.exitCode !== 0) {
    return null
  }
  const command = result.stdout.toString().trim()
  return command === '' ? null : command
}

export async function isPortFree(value: number): Promise<boolean> {
  try {
    const server = Bun.listen({
      hostname: '127.0.0.1',
      port: value,
      socket: { data() {} },
    })
    server.stop(true)
    return true
  } catch {
    return false
  }
}

export function log(message: string): void {
  console.log(`[personal] ${message}`)
}

/**
 * One-time rename of the pre-"Browser" profile and log directories. Only ever
 * moves when the old path exists and the new one does not; never deletes.
 */
export function migrateLegacyDirs(): void {
  for (const [from, to, label] of [
    [LEGACY_PROFILE_DIR, PROFILE_DIR, 'profile'],
    [LEGACY_LOG_DIR, LOG_DIR, 'logs'],
  ] as const) {
    if (from === to || !existsSync(from) || existsSync(to)) {
      continue
    }
    mkdirSync(dirname(to), { recursive: true })
    renameSync(from, to)
    log(`migrated ${label}: ${from} -> ${to}`)
  }
}
