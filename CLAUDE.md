# Browser

An AI-driven, sidebar-first browser. A product by Jawaid Gadiwala for many users, macOS first, then Windows and Linux. Repo: github.com/jawaidgadiwala/browser (public, AGPL-3.0). Product name: **Browser**. Bundle id `com.jawaidgadiwala.browser`. Logo: blue folded "B" (`branding/`). Accent: #2C6BF2. Dev machine: Apple M2 Pro, 16 GB RAM.

## Goal

A browser that combines:
- **Sidebar UX inspired by the reference browsers**: side panel with apps (essentials), spaces with per-space theme, profile switcher, folders, pinned tabs, today tabs, archive, smooth swipe between spaces, compact mode, glance.
- **AI agents as first-class**: Claude Code (and others) inside the browser chat and from the terminal driving the logged-in browser over MCP, with cockpit, replay, audit, tab isolation.
- **Chromium under the hood**: Chrome extensions, CDP, tab groups, side panel.
- **Bring your own AI**: user's own provider keys or connected coding agents (Claude Code, Codex); no dependency on upstream's hosted model.
- Memory-efficient, stable, cross-platform, easy to rebase onto upstream BrowserOS.

Product rules: nothing assumes one user or one platform. "Personal" flags (`personal-build.ts`) are the product flags and will be renamed. AGPL-3.0 means every distributed build ships with source (this repo).

## What we build on, and how each is used

| Source | License | Role | Rule |
|---|---|---|---|
| **BrowserOS** (browseros-ai/BrowserOS), git remote `upstream` | AGPL-3.0 | The base. Their hosted AI provider, CDN feeds, metrics keys, and bug reporter are theirs, not ours: disabled or replaced in the product. Chromium 151 fork + extension/server monorepo. Both "classic" and "neo" ship from it; we run classic as the browser and mount neo's cockpit + Rust server alongside | Keep LICENSE and attribution (`NOTICE`). Publish source (repo is public). Keep our changes small and feature-gated so `git rebase upstream/main` stays cheap |
| **Chromium** | BSD-3 | The engine, checked out at `~/chromium/src` (151.0.7922.137) for native patches | Patches only, via `packages/browseros/chromium_patches` + `.features.yaml`. Never vendor the tree |
| **ungoogled-chromium** patches | BSD-3 | Privacy patches upstream already applies | Keep notice; do not use their name to endorse |
| **Zen Browser** (zen-browser/desktop) | MPL-2.0 | **Behavior reference only** for sidebar, spaces, essentials, compact mode, glance, split view, swipe physics, constants | No code, CSS, or assets copied. Studies: `docs/personal/zen-spaces-design-reference.md`, `docs/personal/zen-sidebar-implementation-review.md` |
| **Reference browser A** | proprietary, closed | **Design reference only**: sidebar layout, spaces model, favorites, folders, archive, capture, paging | No code or assets. Notes stay in gitignored `docs/private/`. Its product name never appears in code, comments, or public docs |
| Claude Code / ACP adapters, MCP | open specs/packages | Agent connectivity | Pinned exact versions (npx range specs re-resolve every launch) |

## Architecture: native shell, extension content

Two layers, each swappable, chosen so that upstream's daily releases rebase cleanly:

1. **Chromium patches** (`packages/browseros/chromium_patches`, registry `.features.yaml`) own the **shell**: branding (name, icon, About, menu bar), side panel docked left with no header, hidden tab strip, toolbar buttons, compact-mode hover reveal, glance overlay, window tint, `chrome.browserOS.*` API additions. Every patch is a named feature, pref-gated (`browseros.*`), small, prefers new files under `chromium_files/`. Plan: `docs/personal/native-patches-plan.md`.
2. **Extension + servers** (`packages/browseros-agent`) own the **content**: sidebar UI, spaces model, essentials, folders, archive, chat, capture, cockpit. React with hot reload. Spec: `docs/personal/sidebar-spec.md` (core model → host adapter → background reconciler → panel surface). All personal-only behavior gated by `apps/app/lib/personal/personal-build.ts` and `product.ts`.

Storage and identity rules: persist by URL and our own ids, never Chromium tab or group ids; one tab group per space per window matched by title; agent sessions use `agent/label` groups that our code never touches, and agents cannot close user groups (MCP guard `protect_user_tab_groups`).

## Running it

- Daily driver: `cd packages/browseros-agent && bun run personal:build && bun run personal:start` (or `tools/personal/Browser.app` / `Browser.command`). Profile `~/Library/Application Support/Browser`. Ports: CDP 9005, chat server 9105, ext 9305, agent server 9205. Logs `~/Library/Logs/Browser/`. Docs: `docs/personal/daily-driver.md`.
- Binary: prefers `/Applications/Browser.app` (re-signed copy from `tools/personal/make-branded-app.sh`) until the native build ships; then the built app.
- Dev loop for extension work: `bun run dev:watch:full:new`, then `BROWSEROS_CDP_PORT=<port> bun scripts/dev/inspect-ui.ts targets|snapshot|click|fill|eval|screenshot <target>`. `fill` does not clear react-hook-form inputs; use eval with the native value setter. Never `chrome.runtime.reload()` in the dev loop (it disables the unpacked extension). Background state: `eval background.js "(async()=>JSON.stringify(await chrome.storage.local.get(null)))()"`. Debug a stuck service worker via chrome://extensions `chrome.developerPrivate.getExtensionsInfo` over CDP.
- Native build: `cd packages/browseros && uv run browseros build --preset release --product browseros --arch arm64 --provision none --no-sign --no-upload --resource-mode published --chromium-src ~/chromium/src` (first build used `--provision shallow`). Needs ~100 GB free; 16 GB RAM works but links slowly. Logs `~/Library/Logs/Browser/chromium-build-*.log`. Patches go through `browseros extract` / `browseros dev doctor`.

## Reference docs (`docs/personal/`, public)

- `sidebar-spec.md`: the build spec for the sidebar (model, adapter, reconciler, UI, constants, slices).
- `native-patches-plan.md`: per-feature Chromium patch plan with files, prefs, risks, order.
- `native-patches-batch1.md`: what batch 1 changes and how to verify (when landed).
- `zen-spaces-design-reference.md`, `zen-sidebar-implementation-review.md`: behavior studies of the MPL reference.
- `neo-features-usage.md`: how cockpit, connect, isolation, replay, skills work.
- `browseros-extension-architecture.md`: map of the extension monorepo.
- `daily-driver.md`: launcher, profile, ports, branded app.
- `docs/private/` (gitignored, local only): proprietary-app studies. Never commit or quote in public docs.

## Rules for Claude working here

- No code or assets from non-open sources. No other-browser product names in code, comments, UI strings, or public docs (say "reference browser").
- Keep upstream attribution; never edit LICENSE files; `NOTICE` lists bases.
- Prefer extension changes over Chromium patches when both work. Prefer new files over editing upstream files. Gate personal behavior behind flags/prefs.
- Follow upstream conventions: Conventional Commits, Bun only, `bun run check` + `bun run test` before commits; Rust `cargo fmt/clippy/test`; Go `go vet/test`.
- Subagents run on Opus (user rule), disjoint file ownership when parallel, commit but do not push; main session pushes after gates.
- Confirm before deleting anything outside caches; never touch `~/chromium/src` while a build runs.

## Status log

- 2026-09-12: Repo mirrored (full history) and pushed; BrowserOS cask, Go, Lima installed; dev loop verified.
- 2026-09-12: Spaces on tab groups shipped. Claude Code via ACP in-browser (adapter pinned to exact version after a range-spec timeout bug).
- 2026-09-12: Neo mounted into classic (`--with-claw`): cockpit ext `pjimfkbpehlcllblajnpfamdfjhhlgkc`, Rust server 9205, terminal Claude Code connected. Full-page capture ⌘⇧2. Promos stripped. MCP guard for user tab groups.
- 2026-09-12: Daily-driver launcher; repo public; proprietary notes moved to `docs/private/`; product renamed to Browser; logo applied to extensions, launcher app, and staged Chromium branding; `/Applications/Browser.app` re-signed copy.
- 2026-09-12: Sidebar shipped, 6 slices: core model + storage v2, host adapter + reconciler, panel skeleton with chat mode, essentials/folders/pinned/dnd, carousel/swipe/theme, archive/undo/settings. 620+ app tests.
- 2026-09-13: Disk freed to ~100 GB; first local Chromium build started (`chromium-build-1.log`). Native patch plan written; batch 1 patches (branding, left panel, no header, hidden strip, toolbar cleanup, blue accent, B vector icon, all strings) and extension rebrand (blue accent, verbiage, logo remnants) in progress.

## Next

1. Finish build 1 (pipeline proof). Apply batch 1 patches, build 2, install via launcher.
2. Batch 2 native: window tint, glance, compact mode. Then spaces in the macOS menu bar.
3. Sidebar polish from daily use; command palette; split-view shortcuts.
4. Windows and Linux lanes via upstream's GitHub Actions workflows (free ubuntu/windows runners on the public repo); signing certs; our own update feed and installer branding.
5. Profile switcher in the sidebar (Chromium profiles), sidebar apps row polish, onboarding for new users, docs site.
