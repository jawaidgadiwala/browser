#!/usr/bin/env bun

// Builds everything the personal daily-driver launcher starts:
//   - apps/app          -> apps/app/dist/chrome-mv3        (classic extension)
//   - apps/claw-app     -> apps/claw-app/dist/chrome-mv3   (neo cockpit, embedded)
//   - claw-server-rust  -> target/release/browseros-claw-server-rs
// The Bun server runs from source, so it needs no build step.

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import {
  AGENT_ROOT,
  APP_DIST,
  CLAW_DIST,
  CLAW_SERVER_BINARY,
  log,
  personalPorts,
} from './config'

async function run(
  command: string[],
  options: { cwd: string; env?: Record<string, string> },
): Promise<void> {
  log(`${options.cwd.replace(AGENT_ROOT, '.')}: ${command.join(' ')}`)
  const proc = Bun.spawn(command, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: ['inherit', 'inherit', 'inherit'],
  })
  const code = await proc.exited
  if (code !== 0) {
    throw new Error(`${command.join(' ')} failed with exit code ${code}`)
  }
}

function assertManifest(dist: string, label: string): void {
  if (!existsSync(join(dist, 'manifest.json'))) {
    throw new Error(`${label} build produced no manifest.json at ${dist}`)
  }
  log(`${label}: ${dist}`)
}

async function main(): Promise<void> {
  const ports = personalPorts()
  const appDir = join(AGENT_ROOT, 'apps/app')
  const clawDir = join(AGENT_ROOT, 'apps/claw-app')

  if (!existsSync(join(appDir, 'generated/graphql/gql.ts'))) {
    await run(['bun', 'run', 'codegen'], { cwd: appDir })
  }

  await run(['bun', '--env-file=../../.env.development', 'wxt', 'build'], {
    cwd: appDir,
  })
  assertManifest(APP_DIST, 'classic extension')

  // BROWSEROS_CLAW_EMBEDDED=1 drops the cockpit's newtab override so the
  // classic extension keeps chrome://newtab; the cockpit is reached at
  // chrome-extension://<id>/newtab.html instead.
  await run(['bun', '--env-file=../../.env.development', 'wxt', 'build'], {
    cwd: clawDir,
    env: {
      BROWSEROS_CLAW_EMBEDDED: '1',
      VITE_BROWSEROS_CLAW_API_URL: `http://127.0.0.1:${ports.claw}`,
    },
  })
  assertManifest(CLAW_DIST, 'neo cockpit')

  await run(['cargo', 'build', '--release', '-p', 'claw-server-rust'], {
    cwd: AGENT_ROOT,
  })
  if (!existsSync(CLAW_SERVER_BINARY)) {
    throw new Error(`claw-server binary missing at ${CLAW_SERVER_BINARY}`)
  }
  log(`claw-server: ${CLAW_SERVER_BINARY}`)

  log('build complete; run `bun run personal:start`')
}

await main()
