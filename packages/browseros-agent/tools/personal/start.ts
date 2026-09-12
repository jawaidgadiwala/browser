#!/usr/bin/env bun

// Personal daily-driver launcher: persistent profile, fixed ports, no HMR.
//
// Order matches tools/dev `watch`: the browser owns CDP, so it starts first
// and the servers attach once CDP answers.

import { existsSync, mkdirSync, openSync } from 'node:fs'
import { join } from 'node:path'

import {
  AGENT_ROOT,
  APP_DIST,
  BROWSERCLAW_STATE_DIR,
  BROWSEROS_BINARY,
  BROWSEROS_STATE_DIR,
  CLAW_DIST,
  CLAW_SERVER_BINARY,
  isPortFree,
  type LauncherState,
  LOG_DIR,
  log,
  migrateLegacyDirs,
  type PersonalPorts,
  PROFILE_DIR,
  personalPorts,
  processCommand,
  readState,
  STATE_FILE,
  sidecarPath,
  writeSidecarConfig,
  writeState,
} from './config'

const CDP_TIMEOUT_MS = 90_000

function browserArgs(ports: PersonalPorts): string[] {
  // Same flag set as tools/dev browser.BuildArgs + apps/app/web-ext.config.ts,
  // minus --browseros-dock-icon=dev (this is the real daily driver).
  return [
    BROWSEROS_BINARY,
    '--no-first-run',
    '--no-default-browser-check',
    '--use-mock-keychain',
    '--test-type',
    '--show-component-extension-options',
    '--disable-browseros-server',
    '--disable-browseros-extensions',
    '--browseros-product=browseros',
    `--remote-debugging-port=${ports.cdp}`,
    `--browseros-mcp-port=${ports.server}`,
    `--browseros-server-port=${ports.server}`,
    `--browseros-proxy-port=${ports.server}`,
    `--browseros-extension-port=${ports.extension}`,
    `--user-data-dir=${PROFILE_DIR}`,
    `--load-extension=${APP_DIST},${CLAW_DIST}`,
    'chrome://newtab',
  ]
}

function childEnv(ports: PersonalPorts): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    NODE_ENV: 'development',
    BROWSEROS_CDP_PORT: String(ports.cdp),
    BROWSEROS_SERVER_PORT: String(ports.server),
    BROWSEROS_EXTENSION_PORT: String(ports.extension),
    BROWSEROS_USER_DATA_DIR: PROFILE_DIR,
    BROWSEROS_PRODUCT: 'browseros',
    BROWSEROS_DIR: BROWSEROS_STATE_DIR,
    BROWSERCLAW_DIR: BROWSERCLAW_STATE_DIR,
  }
}

function logSink(name: string): number {
  return openSync(join(LOG_DIR, `${name}.log`), 'a')
}

/** Refuses to start when a previous personal instance is still alive. */
function assertNoLiveInstance(): void {
  const previous = readState()
  if (!previous) {
    return
  }
  const live = Object.entries(previous.pids).filter(([, pid]) => {
    if (typeof pid !== 'number') {
      return false
    }
    const command = processCommand(pid)
    return (
      command !== null && /BrowserOS|claw-server|apps\/server/.test(command)
    )
  })
  if (live.length === 0) {
    return
  }
  const detail = live.map(([name, pid]) => `${name}=${pid}`).join(' ')
  throw new Error(
    `A personal instance is already running (${detail}).\n` +
      `Stop it with: bun run personal:stop  (state file: ${STATE_FILE})`,
  )
}

async function assertPortsFree(ports: PersonalPorts): Promise<void> {
  const busy: string[] = []
  for (const [name, value] of Object.entries(ports)) {
    if (!(await isPortFree(value))) {
      busy.push(`${name}=${value}`)
    }
  }
  if (busy.length > 0) {
    throw new Error(
      `Ports already in use: ${busy.join(', ')}.\n` +
        'Another BrowserOS (dev watch, released app, or a stale personal run) holds them. ' +
        'Close it, or override BROWSEROS_PERSONAL_{CDP,SERVER,EXTENSION,CLAW}_PORT.',
    )
  }
}

async function waitForCDP(port: number): Promise<boolean> {
  const deadline = Date.now() + CDP_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (response.ok) {
        return true
      }
    } catch {
      // browser still starting
    }
    await Bun.sleep(500)
  }
  return false
}

function assertBuilt(): void {
  const missing = [
    [APP_DIST, 'classic extension'],
    [CLAW_DIST, 'neo cockpit'],
  ].filter(([dist]) => !existsSync(join(dist, 'manifest.json')))
  if (missing.length > 0) {
    throw new Error(
      `Missing builds: ${missing.map(([, label]) => label).join(', ')}. Run: bun run personal:build`,
    )
  }
  if (!existsSync(BROWSEROS_BINARY)) {
    throw new Error(`BrowserOS binary not found at ${BROWSEROS_BINARY}`)
  }
}

function clawServerCommand(): string[] {
  const config = sidecarPath('claw-server')
  if (existsSync(CLAW_SERVER_BINARY)) {
    return [CLAW_SERVER_BINARY, '--config', config]
  }
  log('claw-server release binary missing; falling back to cargo run')
  return [
    'cargo',
    'run',
    '--release',
    '-p',
    'claw-server-rust',
    '--',
    '--config',
    config,
  ]
}

async function main(): Promise<void> {
  const ports = personalPorts()
  assertBuilt()
  migrateLegacyDirs()
  for (const dir of [
    PROFILE_DIR,
    LOG_DIR,
    BROWSEROS_STATE_DIR,
    BROWSERCLAW_STATE_DIR,
  ]) {
    mkdirSync(dir, { recursive: true })
  }
  assertNoLiveInstance()
  await assertPortsFree(ports)

  writeSidecarConfig({
    path: sidecarPath('browseros-server'),
    serverPort: ports.server,
    cdpPort: ports.cdp,
    resourcesDir: join(AGENT_ROOT, 'resources'),
    executionDir: PROFILE_DIR,
  })
  writeSidecarConfig({
    path: sidecarPath('claw-server'),
    serverPort: ports.claw,
    cdpPort: ports.cdp,
    resourcesDir: join(AGENT_ROOT, 'apps/claw-server-rust/resources'),
    executionDir: PROFILE_DIR,
  })

  const env = childEnv(ports)
  log(`profile: ${PROFILE_DIR}`)
  log(`logs:    ${LOG_DIR}`)
  log(
    `ports:   cdp=${ports.cdp} server=${ports.server} extension=${ports.extension} claw=${ports.claw}`,
  )

  const browser = Bun.spawn(browserArgs(ports), {
    cwd: AGENT_ROOT,
    env,
    stdio: ['ignore', logSink('browser'), logSink('browser')],
  })
  log(`browser pid ${browser.pid}`)

  if (!(await waitForCDP(ports.cdp))) {
    browser.kill()
    throw new Error(`CDP never came up on port ${ports.cdp}`)
  }
  log('CDP ready')

  const server = Bun.spawn(
    [
      'bun',
      '--env-file=../../.env.development',
      'src/index.ts',
      '--config',
      sidecarPath('browseros-server'),
    ],
    {
      cwd: join(AGENT_ROOT, 'apps/server'),
      env,
      stdio: ['ignore', logSink('server'), logSink('server')],
    },
  )
  log(`bun server pid ${server.pid} (port ${ports.server})`)

  const claw = Bun.spawn(clawServerCommand(), {
    cwd: AGENT_ROOT,
    env,
    stdio: ['ignore', logSink('claw-server'), logSink('claw-server')],
  })
  log(`claw server pid ${claw.pid} (port ${ports.claw})`)

  const state: LauncherState = {
    startedAt: new Date().toISOString(),
    ports,
    profileDir: PROFILE_DIR,
    pids: { browser: browser.pid, server: server.pid, claw: claw.pid },
  }
  writeState(state)

  let stopping = false
  const stopChildren = () => {
    if (stopping) {
      return
    }
    stopping = true
    for (const child of [claw, server, browser]) {
      try {
        child.kill()
      } catch {
        // already gone
      }
    }
  }
  process.on('SIGINT', stopChildren)
  process.on('SIGTERM', stopChildren)

  log('running; quit BrowserOS or press Ctrl+C to stop everything')
  await browser.exited
  log('browser exited; stopping servers')
  stopChildren()
  await Promise.all([server.exited, claw.exited])
  writeState({ ...state, pids: {} })
  log('stopped')
}

await main()
