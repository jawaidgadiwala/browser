#!/usr/bin/env bun

import { runProdResourceBuild } from '@browseros/build-server-tools'

import { ensureBunBinaries, resolvePlatforms } from './fetch-bun-binaries'
import { browserosServerBuildProduct } from './server/descriptor'

const argv = process.argv.slice(2)

// The bundled Bun runtime comes from the official GitHub releases, not R2, so
// fetch whatever the requested targets need before the manifest is staged.
function requestedTargets(args: string[]): string[] {
  const index = args.findIndex(
    (arg) => arg === '--target' || arg.startsWith('--target='),
  )
  if (index === -1) {
    return []
  }
  const arg = args[index]
  const value = arg?.startsWith('--target=')
    ? arg.slice('--target='.length)
    : args[index + 1]
  if (!value || value === 'all') {
    return []
  }
  return value.split(',')
}

async function main(): Promise<void> {
  await ensureBunBinaries(resolvePlatforms(requestedTargets(argv)))
  await runProdResourceBuild(browserosServerBuildProduct, argv)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`\n✗ ${message}\n`)
  process.exit(1)
})
