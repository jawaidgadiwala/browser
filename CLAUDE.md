# Personal AI Browser

Personal, optimized, AI-driven browser for Jawaid. Not a product. One user, one machine (Apple M2 Pro, 16 GB RAM, macOS).

## Decision (2026-09-12)

**Base: BrowserOS (browseros-ai/BrowserOS, AGPL-3.0, Chromium 151 fork).**
**Add-on layer: Zen-inspired UX, re-implemented by us. Zen code is NOT a base and is NOT copied.**

Why BrowserOS over Zen as base:
- Chromium engine: Chrome extensions, CDP, MCP, Claude-in-Chrome / DevTools MCP all work natively.
- Agent stack already exists: MCP server, agent loop, CDP bindings, Claude Code / Codex one-click connect.
- Vertical tab strip already on: `kVerticalTabs` flipped `ENABLED_BY_DEFAULT` in patch `chrome/browser/ui/tabs/features.cc`. Zen-like sidebar tabs come mostly free from upstream Chromium.
- Zen is Firefox/Gecko (surfer build system, 266 Firefox patches, XUL/JS chrome). Adding a CDP/MCP agent stack to Gecko is far more work than restyling Chromium.

Why Zen still matters:
- Reference for interaction design only: spaces/workspaces, compact mode, glance (peek), split view, pinned/essential tabs, folders, mods. Study `zen/src/zen/*` in scratchpad or upstream, then re-implement concepts.

## BrowserOS: two products, one repo

| Product | What it is | Status (Sept 2026) |
|---|---|---|
| **BrowserOS** ("classic") | Daily-driver browser. Side panel chat, new-tab agent, scheduled tasks, BYOK (Claude/OpenAI/Gemini/Ollama/LM Studio), uBlock MV2, 20+ tools, 40+ app integrations. | Actively released: server 0.0.164 and extension 0.0.156 shipped 2026-09-11. NOT maintenance mode. |
| **BrowserOS neo** ("browserclaw") | Secondary browser for agents only. Cockpit dashboard, session replay video, Rust MCP server (`claw-server-rust`), harness auto-connect (Claude Code, Codex, Cursor, OpenClaw). | Marketing-primary since 2026-09-11 docs split. macOS + Windows only. |

Both share the same Chromium patch set and `packages/browseros-agent` monorepo. Build flag `--product browseros` vs `--product browserclaw` picks product.

**Our pick: BrowserOS classic** as the daily browser, plus neo's MCP/replay ideas where useful. Classic is the one meant for a human driving it. neo is explicitly "not a Chrome replacement".

## Repo layout (upstream, for reference)

```
packages/browseros/                 Chromium fork: 377 patch files, Python build CLI (uv), CHROMIUM_VERSION=151.0.7922.137
  chromium_patches/.features.yaml   feature registry (vertical-tabs, llm-chat, side-panel, cdp-api, extensions-manifestv2, ...)
packages/browseros-agent/           Bun monorepo
  apps/server/                      Bun: MCP server + agent loop (classic). Connects to browser over CDP port from sidecar config.
  apps/app/                         WXT + React extension: new tab, side panel chat, settings (classic)
  apps/claw-server-rust/            Rust axum + rmcp: neo MCP endpoint + cockpit API
  apps/claw-app/                    neo cockpit extension
  apps/cli/                         Go CLI
  packages/browser-mcp/             MCP tool surface: act, navigate, snapshot, screenshot, read, grep, evaluate, tabs, tab_groups, windows, wait, upload, download, pdf, history, diff, run
  crates/                           browseros-cdp, browseros-core, browseros-mcp, claw-api, harness-integrations
```

Where customization lives:
- **UI shell (tabs, sidebar, toolbar, side panel, keyboard shortcuts):** C++ Views patches under `chromium_patches/chrome/browser/ui/`. Requires full Chromium build.
- **Agent, chat, new tab, settings, MCP tools, providers:** TypeScript in `browseros-agent`. No Chromium build needed. Runs against a prebuilt BrowserOS binary.

## Hard constraint: no local Chromium build right now

Machine has ~18 GB free disk and 16 GB RAM. Chromium build needs ~100 GB disk, 16 GB+ RAM, 1 to 3 hours per build. Do not attempt locally until disk is freed or an external SSD is attached. Options when we get there: external NVMe, or fork repo and use upstream GitHub Actions workflows (`release-macos.yml`, `nightly-macos-browseros.yml`) to build in CI.

## Plan

### Phase 0: Use, don't build (now)
1. `brew install --cask browseros`. Import Chrome profile.
2. Enable vertical tabs, connect Claude Code via MCP, wire BYOK providers.
3. Live in it 1 to 2 weeks. Keep a running list in `NOTES.md` of what is missing vs Zen (spaces, compact mode, glance, split view polish, command palette, theming).

### Status log
- 2026-09-12: Repo mirrored to github.com/jawaidgadiwala/browser (full upstream history, `upstream` remote = browseros-ai/BrowserOS). BrowserOS cask, Go, Lima installed. Dev loop `bun run dev:watch -- --new` verified.
- 2026-09-12: **Spaces shipped** in extension layer (`apps/app`): `lib/spaces/*`, `entrypoints/background/spaces.ts`, `components/spaces/*`, `screens/spaces-settings/*`, `/settings/spaces`, manifest `commands` (⌥⇧→ ⌥⇧← ⌥⇧S, plus space-1..9 unbound). Tested live over CDP: create, switch, adopt new tabs, follow active tab, rename (group title follows), reorder, delete (tabs ungroup), settings toggles, cmdk switcher. Design: one Chromium tab group per space per window matched by title; switch = expand target + activate last tab + collapse others. Known gap: leaving a space by clicking a tab in another group does not record the old space's last tab (only pill/shortcut switches do).
- 2026-09-12: Claude Code via ACP is opt-in in Settings → AI & Agents → Add Claude Code. Server launches `npx -y @agentclientprotocol/claude-agent-acp@^0.75.1` (no bundled Bun in dev). First install took ~5 min on this network and exceeded the 120s probe cap; warm the npx cache once before first setup.

- 2026-09-12 (evening): **Neo mounted into classic.** `bun run dev:watch:full` (or `:new`) runs classic + neo cockpit extension (embedded mode, id `pjimfkbpehlcllblajnpfamdfjhhlgkc`) + Rust `claw-server-rust` (port 9205) in one browser. Sidebar "Agents" item opens the cockpit. Terminal Claude Code connects to `http://127.0.0.1:9205/mcp` (cockpit → Connect writes `~/.claude.json`).
- 2026-09-12: **Full-page capture** ⌘⇧2 (Chromium rejects ⌘⇧F on mac): chrome.debugger `captureBeyondViewport` primary, scroll-stitch fallback, clipboard + `~/Downloads/BrowserOS Captures/`, BrowserOS patch already hides the debugger infobar. **Promos stripped** behind `lib/personal/personal-build.ts`.
- 2026-09-12: **Daily driver:** `bun run personal:build` then `bun run personal:start` (or `tools/personal/BrowserOS Personal.command`). Profile `~/Library/Application Support/BrowserOS Personal`, ports 9005/9105/9305/9205, logs `~/Library/Logs/BrowserOS Personal/`. See `docs/personal/daily-driver.md`.
- 2026-09-12: **Sidebar project started.** Spec: `docs/personal/sidebar-spec.md` (single item tree, host adapter, reconciler, panel surface, 6 slices). Slice 1 landed (core model, storage schema v2 under `sidebar:*`, migration from `local:spaces`). Slices 2 (host adapter + reconciler) and 3 (panel skeleton in side panel, mode switch with chat) in progress. Research inputs: `docs/personal/zen-sidebar-implementation-review.md` (public, MPL source study) and local-only `docs/private/*` (gitignored; never publish).
- Repo went **public** 2026-09-12 (free Actions minutes). Rules: no code or assets from non-open sources; no other-browser product names in code/comments; reverse-engineering notes stay in `docs/private/`.
- Chromium build plan: native patches (left dock pref, hide tab strip, hide panel header, compact hover, glance, window tint) later via GitHub Actions macOS xlarge runner or self-hosted Mac; not locally (16 GB RAM, 19 GB disk).

### Phase 1: Agent layer fork (no Chromium build)
1. Fork `browseros-ai/BrowserOS` to own GitHub. Work only inside `packages/browseros-agent`.
2. Dev loop: `bun install`, `bun run dev:watch` (classic). Needs Bun, Go, Lima, Rust. macOS only.
3. Customize: side panel chat UX, new tab, default prompts, own MCP tools, provider defaults (Claude first), scheduled tasks, personal skills. Extension + server updates load into the prebuilt browser.
4. Add own skills/prompts for Jawaid workflows (Gmail, GitHub, Jira, admin panels).

### Phase 2: Shell UI (Chromium patches, CI or external disk)
1. Fix disk. Set up `depot_tools` + Chromium 151 checkout matching `CHROMIUM_VERSION`.
2. Add patches as new features in `.features.yaml`, mirroring upstream conventions so rebases stay easy.
3. Zen-inspired features in priority order: workspaces/spaces on top of Chromium tab groups + profiles, compact mode (auto-hide sidebar and toolbar), command palette, glance/peek, split view polish, theme/accent system.
4. Rebase onto upstream BrowserOS regularly. Keep our patches small and feature-scoped.

### Phase 3: Optimize for one user
- Strip what Jawaid does not use (metrics, onboarding, updater prompts, feedback button).
- Local model path (Ollama / LM Studio) for cheap tasks, Claude for hard ones.
- Everything local-first.

## Evaluated and rejected (2026-09-12)

| Project | What it is | Why not |
|---|---|---|
| **openbrowserclaw.com** (wexare-ai/openbrowserclaw, MIT, 600 stars) | Web app / PWA chat assistant. Claude API in a Web Worker, IndexedDB, OPFS, v86 WASM Linux sandbox, Telegram channel, cron tasks. "NanoClaw reimagined in a browser tab". | Not a browser. Runs inside a tab. No page automation, no CDP. Dead since 2026-02-26. Name collision with BrowserOS neo ("browserclaw") only. |
| **browserclaw.com** | Hosted Chinese SaaS assistant (Feishu, WhatsApp, GitHub channels, cron, memory, $10/mo free credit). Closed source. | Cloud service, not open source, not a browser. Unrelated to BrowserOS despite name. |
| **Zen (zen-browser/desktop, MPL-2.0, 44k stars, Firefox 155)** | Firefox fork via surfer build. 266 Firefox patches. UX in `src/zen/*`: spaces, compact-mode, glance, split-view, folders, live-folders, mods, tabs, urlbar, kbs. ~12k lines JS for tabs/spaces/split/compact alone. | Gecko. No CDP, no Chrome extensions, no MCP stack. Adding agent layer = build from scratch. Use as UX reference only. |
| **ChromiumOS / chromium/chromium** | Raw engine. | BrowserOS already is a maintained Chromium 151 fork with patch tooling. Starting from raw Chromium throws away their build system, MCP server, and ungoogled patches. |

## Rules for Claude working here
- Never copy Zen source, CSS, icons, or assets. Concepts only.
- Never run a Chromium fetch or build on this machine without confirming disk has 100 GB+ free.
- Prefer changes in `browseros-agent` (TS) over Chromium patches when both can solve the problem.
- Follow upstream conventions: Conventional Commits, Bun only (npm/yarn/pnpm rejected), `bun run check` before commits.
- AGPL-3.0: fine for personal use. If binaries are ever shared, source must be published.
- Zen source for UX reference: clone `zen-browser/desktop` into the scratchpad when needed. Upstream BrowserOS is the `upstream` git remote. This repo has LFS filters disabled (`filter.lfs.*` = cat); LFS gifs are pointer files, fine.
- Dev loop testing: `bun run dev:watch -- --new`, read the CDP port, then `BROWSEROS_CDP_PORT=<port> bun scripts/dev/inspect-ui.ts targets|snapshot|click|fill|eval|screenshot <target>`. `fill` does not clear react-hook-form inputs; use eval with the native value setter + `input` event for renames. Background state: `eval background.js "(async()=>JSON.stringify(await chrome.storage.local.get(null)))()"`.
