#!/usr/bin/env bun

// Stops the browser and servers started by tools/personal/start.ts.
// Only pids recorded in the launcher state file are touched, and only when
// their command line still looks like the process we started.

import {
  log,
  processCommand,
  readState,
  STATE_FILE,
  writeState,
} from './config'

const EXPECTED = /BrowserOS|claw-server|apps\/server|src\/index\.ts/

async function terminate(name: string, pid: number): Promise<void> {
  const command = processCommand(pid)
  if (command === null) {
    return
  }
  if (!EXPECTED.test(command)) {
    log(
      `skipping ${name} pid ${pid}: unrelated process (${command.slice(0, 60)})`,
    )
    return
  }
  log(`stopping ${name} pid ${pid}`)
  process.kill(pid, 'SIGTERM')
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await Bun.sleep(250)
    if (processCommand(pid) === null) {
      return
    }
  }
  log(`${name} pid ${pid} did not exit; sending SIGKILL`)
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    // already gone
  }
}

const state = readState()
if (!state) {
  log(`no launcher state at ${STATE_FILE}; nothing to stop`)
} else {
  for (const [name, pid] of Object.entries(state.pids)) {
    if (typeof pid === 'number') {
      await terminate(name, pid)
    }
  }
  writeState({ ...state, pids: {} })
  log('stopped')
}
