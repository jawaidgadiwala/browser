# Personal daily driver

Runs the customized stack — classic extension (`apps/app`, with Spaces/capture),
neo cockpit (`apps/claw-app`), Bun server (`apps/server`), Rust claw server
(`apps/claw-server-rust`) — against a **persistent** profile, with no HMR and no
dev supervisor.

Everything lives in `packages/browseros-agent/tools/personal/`. Run the commands
from `packages/browseros-agent`.

## Commands

```bash
bun run personal:build   # build both extensions + the Rust server (release)
bun run personal:start   # launch the stack; runs until the browser quits
bun run personal:stop    # stop whatever personal:start started
```

Double-clickable launcher: `tools/personal/Browser.command`. Drag it
onto the Dock (right-hand side, next to the Trash — the Dock only accepts files
there) or into `~/Applications` and give it a custom icon via Finder → Get Info.
Double-clicking opens Terminal, `cd`s to the repo, and runs `personal:start`.
Closing that Terminal window (or quitting the browser) stops the stack.

## What gets built and where

| Piece | Command | Output |
| --- | --- | --- |
| Classic extension | `wxt build` (production) in `apps/app` | `apps/app/dist/chrome-mv3` |
| Neo cockpit | `wxt build` with `BROWSEROS_CLAW_EMBEDDED=1` in `apps/claw-app` | `apps/claw-app/dist/chrome-mv3` |
| Rust claw server | `cargo build --release -p claw-server-rust` | `target/release/browseros-claw-server-rs` |
| Bun server | none — runs from source | `apps/server/src/index.ts` |

`chrome-mv3` (production) is deliberately separate from the dev loop's
`chrome-mv3-dev`, so `bun run dev:watch` and the personal launcher never fight
over the same dist directory. Embedded mode strips the cockpit's newtab
override, so the classic extension keeps `chrome://newtab` and the cockpit is
reached at `chrome-extension://jllpmhghjcbaccmpindcmpkddjekbnmm/newtab.html#/`.
The cockpit's API URL (`VITE_BROWSEROS_CLAW_API_URL`) is baked in at build time
from the configured claw port, so re-run `personal:build` after changing it.

## Runtime layout

- Profile: `~/Library/Application Support/Browser` (persistent; the
  released app's `~/Library/Application Support/BrowserOS` is never touched).
- Logs: `~/Library/Logs/Browser/{browser,server,claw-server}.log`.
- Migration: the first `personal:start` after the rename to **Browser** renames
  `~/Library/Application Support/BrowserOS Personal` -> `.../Browser` and
  `~/Library/Logs/BrowserOS Personal` -> `.../Browser`, but only when the old
  path exists and the new one does not. Nothing is deleted; it logs each move.
- Server state: `~/.browseros-personal`, `~/.browserclaw-personal`.
- Sidecar configs: `<profile>/sidecars/{browseros-server,claw-server}.json`,
  written on every start in the same format `tools/dev` uses.
- PID/state file: `<profile>/personal-launcher.json`.
- Ports: CDP 9005, Bun server 9105, extension 9305, claw server 9205.

Startup order mirrors `tools/dev watch`: browser first (it owns CDP), wait for
CDP, then the Bun server, then the claw server. Chromium flags are the same set
`tools/dev/browser/args.go` and `apps/app/web-ext.config.ts` use
(`--disable-browseros-server --disable-browseros-extensions --test-type
--use-mock-keychain --browseros-product=browseros`, the four port flags, the
persistent `--user-data-dir`, and `--load-extension=<app dist>,<claw dist>`),
minus `--browseros-dock-icon=dev` — this is the real daily driver.

## Overrides

All optional, via env (or `.env.development`, which Bun loads automatically):

```
BROWSEROS_PERSONAL_PROFILE, BROWSEROS_PERSONAL_LOG_DIR, BROWSEROS_PERSONAL_BINARY
BROWSEROS_PERSONAL_STATE_DIR, BROWSEROS_PERSONAL_CLAW_STATE_DIR
BROWSEROS_PERSONAL_CDP_PORT, BROWSEROS_PERSONAL_SERVER_PORT
BROWSEROS_PERSONAL_EXTENSION_PORT, BROWSEROS_PERSONAL_CLAW_PORT
```

## Idempotence and safety

- `personal:start` refuses to start when the recorded pids are still alive, or
  when any of the four ports is taken. It never kills anything it did not start;
  close the other browser (or the dev watch) yourself.
- `personal:stop` only signals pids from the state file, and only when their
  command line still looks like the process we launched.
- Ctrl+C in the launcher terminal stops browser and both servers.

## First run

- The classic extension shows its onboarding flow on the fresh profile. That is
  expected; walk through it once.
- Side panel on the left: Settings → Appearance → Side panel → Left. Chromium
  stores this per profile, so it sticks.
- The claw server reconciles harness MCP configs (Claude Code, Codex, …) to
  `http://127.0.0.1:9205` on start, exactly as the dev loop does. Keeping the
  personal claw port fixed at 9205 keeps those configs stable.

## Verified (2026-09-12)

`personal:build` then `personal:start`: CDP answered on 9005;
`http://127.0.0.1:9105/health` → `{"status":"ok","cdpConnected":true}`;
`http://127.0.0.1:9205/system/health` → `{"status":"ok"}`; the classic new tab
renders (title `BrowserOS`, Spaces UI present) and the cockpit renders at the
neo extension URL; `personal:stop` left no processes and no listeners on the
four ports.

Note: MV3 service workers idle out, so `curl http://127.0.0.1:9005/json` may
list only the classic worker. The neo extension is confirmed loaded by its
cockpit page answering with `chrome.runtime.id ===
"jllpmhghjcbaccmpindcmpkddjekbnmm"`.

## Which binary it launches

`tools/personal/config.ts` picks the first of these that exists, and
`BROWSEROS_PERSONAL_BINARY` overrides all of them:

1. `~/chromium/src/out/Default_browseros_<arch>/Browser.app/Contents/MacOS/Browser`
   — the app we build ourselves (`BROWSEROS_CHROMIUM_SRC` moves the checkout
   root; see `docs/personal/native-build.md`);
2. `/Applications/Browser.app/Contents/MacOS/Browser` — that app installed;
3. `/Applications/Browser.app/Contents/MacOS/BrowserOS` — the re-signed copy of
   the upstream cask, whose *bundle* was renamed but whose inner executable
   still carries the old name;
4. `/Applications/BrowserOS.app/Contents/MacOS/BrowserOS` — the stock cask.

`apps/claw-app/web-ext.config.ts` uses the same order for the WXT runner when
`BROWSEROS_BINARY` is unset.

## App icon and name in the Dock

The extension layer cannot change the app bundle's icon or name. Until the
native build is what you launch, `tools/personal/make-branded-app.sh` creates
`/Applications/Browser.app`: a copy of the stock bundle with `branding/Browser.icns`,
`CFBundleName`/`CFBundleDisplayName` set to "Browser", and an ad-hoc signature
(hardened runtime dropped so the nested frameworks load). `personal:start`
prefers that bundle when present. Re-run the script after every BrowserOS update.

Caveats: ad-hoc signing means macOS may ask once to allow keychain access for
"BrowserOS Safe Storage"; click Always Allow. Sparkle auto-update inside the
copy is meaningless; update the stock bundle and re-run the script.
