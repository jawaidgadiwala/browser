# BrowserOS agent monorepo — architecture map for a "Spaces" feature

Repo root (all paths below are relative to it unless absolute):
`/private/tmp/claude-501/-Users-jawaid-Documents-Personal-Browser/70eb337d-a9fe-4335-9050-6c1bcb6faa92/scratchpad/bos/packages/browseros-agent/`

Workspaces: `apps/*`, `packages/*`, `crates/*` (Bun 1.4.2, `package.json:6-10`, `engines` pins bun and
forbids npm/yarn/pnpm at `package.json:130-136`). Rust crates + Go tools live alongside the TS apps.

---

## 1. apps/app structure (WXT + React extension)

### WXT config — `apps/app/wxt.config.ts`
- `outDir: 'dist'` (line 21), `modules: ['@wxt-dev/module-react']` (line 22).
- Manifest name `Assistant`, pinned `key` (fixed extension id `lmihdclmhdopaeappmadgmglglcabodf`), self-hosted
  `update_url` on cdn.browseros.com (lines 29-32).
- `externally_connectable` (33-36): diagnostics reporter extension id + the BrowserOS API host.
- `web_accessible_resources` (37-46): `app.html` exposed to the product web host and the legacy agent extension.
- **`chrome_url_overrides: { newtab: 'app.html' }` (47-49)** — the new tab IS the app page; there is no
  separate `newtab` entrypoint despite what `apps/app/CLAUDE.md` claims.
- **`options_ui: { page: 'app.html#/settings', open_in_tab: true }` (50-53)** — settings is a hash route of the
  same page.
- `action` (54-62): toolbar icon, `default_title: 'Ask BrowserOS'`; click toggles the side panel.
- **`permissions` (63-79)**: `system.cpu`, `system.memory`, `topSites`, `storage`, `unlimitedStorage`,
  `scripting`, `tabs`, `tabGroups`, `sidePanel`, `bookmarks`, `history`, `browserOS` (BrowserOS-only API),
  `alarms`, `webNavigation`, `downloads`.
- **`host_permissions: ['http://127.0.0.1/*']` (line 80)** — the local agent server only.
- **No `commands` key at all** and no `sessions` permission (see §4).
- Vite plugins: `@tailwindcss/vite` + optional `@sentry/vite-plugin` (83-99); hidden sourcemaps archived by
  `lib/build/archive-source-maps`.

### Entrypoints — `apps/app/entrypoints/`
| Path | What it is |
|---|---|
| `app/{index.html,main.tsx,App.tsx}` | The one big SPA: new tab, home, settings, onboarding, connect-apps, scheduled |
| `sidepanel/{index.html,main.tsx,App.tsx}` | Chat side panel (routes: index `Chat`, `history`) |
| `background/index.ts` + `background/scheduledJobRuns.ts` | MV3 service worker |
| `content.ts` | No-op stub scoped to `*://*.google.com/*` |
| `auth.content/index.ts`, `glow.content/index.ts`, `selection.content.ts` | Page integrations (auth callback, glow overlay, selected-text capture) |

There is **no popup entrypoint** — the action click toggles the side panel
(`entrypoints/background/index.ts:75-79`).

### chrome.* APIs actually used (counts across `apps/app/**/*.ts{,x}`)
- `chrome.tabs.*` — heaviest: `query` (8), `create` (8), `update` (2), `get` (2), `remove`, `sendMessage`,
  `onCreated`, `onRemoved`, `onActivated` (2).
- `chrome.sidePanel.*` — `setOptions`, `getOptions`, `close`, and BrowserOS-specific
  `browserosToggle` / `browserosIsOpen` (`lib/browseros/toggleSidePanel.ts`).
- `chrome.browserOS.*` — BrowserOS fork API: `getPref`/`setPref`, `choosePath`, `logMetric`,
  `getVersionNumber`, `getBrowserosVersionNumber`.
- `chrome.runtime.*`, `chrome.action.onClicked`, `chrome.alarms.*` (scheduled jobs),
  `chrome.topSites.get` (`screens/newtab/index/recent-sites.hooks.ts:16`),
  `chrome.windows.getCurrent` (only in `lib/browseros/incognito.ts:14`),
  `chrome.extension.inIncognitoContext`.
- **`chrome.tabGroups` is permitted but never called from TS.** Tab-group manipulation lives in the Rust MCP
  server: `crates/browseros-mcp/src/tools/tab_groups.rs`, `windows.rs`, `tabs.rs`.
- **`chrome.sessions` is not permitted and never used.**

---

## 2. New tab page — component tree, routing, state, styling

New tab loads `app.html` → `entrypoints/app/main.tsx:12-28`, which nests providers:
`AuthProvider` → `QueryProvider` (TanStack Query) → `AnalyticsProvider` → `ThemeProvider` → `<App/>` + `<Toaster/>`.
`entrypoints/app/index.html:9-28` inlines a pre-paint theme script reading `lib/theme/theme-storage`.

Routing — `entrypoints/app/App.tsx` (react-router v7 `HashRouter`, one central table, lines 52-130):
```
<SidebarLayout>                               # components/layout/SidebarLayout.tsx
  /home            -> <NewTabLayout>          # screens/newtab/layout/NewTabLayout.tsx
       index       -> <AgentCommandHome>      # screens/agent-command/AgentCommandHome.tsx
       /home/chat  -> <NewTabChat>            # screens/newtab/index/NewTabChat.tsx
       /home/personalize -> <Personalize>
  /connect-apps, /scheduled
<SettingsSidebarLayout>                       # components/layout/SettingsSidebarLayout.tsx
  /settings/{ai,chat,mcp,customization,diagnostics,survey,usage}
/features, /onboarding/ai, plus many <Navigate> back-compat redirects
"/" -> /home ; "*" -> /home
```
Layout chain for the new tab: `SidebarLayout` (`SidebarLayout.tsx:108-149`) renders a fixed hover-expanding rail
(`w-14` collapsed / `w-64` expanded, content offset `pl-14`) containing
`components/sidebar/AppSidebar.tsx` → `SidebarBranding` + `SidebarNavigation` + `SidebarUserFooter`.
`NewTabLayout.tsx:7-29` adds the background `NewTabFocusGrid` and wraps `/home/chat` in a `ChatSessionProvider`
keyed by `conversationId`. `AgentCommandHome.tsx:83-120` is the hero: headline, `ConversationInput` (with
provider/agent picker), then `RecentSites`, `ScheduleResults`, `ImportDataHint`, promo banners.

**Where a Spaces bar slots in** (three viable seams, in preference order):
1. `screens/newtab/layout/NewTabLayout.tsx:11-16` — insert `<SpacesBar/>` above `<Outlet/>`; it is scoped to
   `/home*` only and already owns new-tab chrome.
2. `components/sidebar/SidebarNavigation.tsx:26-39` — a vertical spaces list in the rail (Arc-like), above
   `primaryNavItems`; `SidebarHistory` is already a precedent for a dynamic list there.
3. `screens/agent-command/AgentCommandHome.tsx` — a horizontal pill row directly above the hero input.

State/styling:
- **No zustand, no redux.** Server state = **TanStack Query** (`@tanstack/react-query` + persisters +
  `react-query-kit`); local/persistent state = `@wxt-dev/storage` items + React `useState`/context.
- Cross-surface propagation pattern: a storage "revision" item bumped by the writer and `watch`ed by readers to
  invalidate queries — `modules/schedules/schedules.revision.ts:16-27`.
- Contexts, not stores: `modules/chat/chat-session-context`, `modules/conversations/active-conversation-context`,
  `lib/rpc/RpcClientProvider`.
- Styling: **Tailwind v4** via `@tailwindcss/vite`, shadcn-style primitives in `components/ui/` (+ `components.json`,
  `components/ai-elements/`); both are treated as generated (`.fallowrc.jsonc` skips them) — don't hand-edit.
  Icons: `lucide-react`. Class merge helper `lib/utils.ts` (`cn`).

### Storage abstraction
Everything goes through `@wxt-dev/storage`'s `storage.defineItem<T>('local:key', { fallback })`.
~26 modules use it; canonical examples:
- `lib/theme/theme-storage.ts:11-13` (simplest)
- `lib/workspace/workspace-storage.ts:13-21` — **closest existing analogue to Spaces**: a list item
  (`local:workspaceFolders`) plus a selected-item item (`local:selectedWorkspace`).
- `lib/personalization/personalizationStorage.ts:11-54` — the `useX()` hook shape: `getValue()` on mount,
  `.watch()` for cross-context sync, debounced `setValue`.
- `modules/chat/sidepanel-chat-targets.ts` — selection object persisted + reader/writer/watcher interfaces
  broken out so helpers stay unit-testable without the extension APIs.

---

## 3. Background service worker — `apps/app/entrypoints/background/index.ts`

`defineBackground(() => { ... })` (line 46). On start it:
- registers diagnostics (`registerDiagnostics('browseros', getAgentServerUrl)`, line 47);
- starts `createConversationPanelBroker()` — one long-lived server subscription that routes conversation events to
  panels (49-51);
- prepares per-tab side panel options for every existing tab and `chrome.tabs.onCreated` (55-68);
- `Capabilities.initialize()`, `setupLlmProvidersBackupToBrowserOS()`, `startLocalFirstMigration()`,
  `scheduledJobRuns()` (69-73);
- `chrome.action.onClicked` → `toggleSidePanel` (75-79);
- `chrome.runtime.onInstalled` → side-panel init on INSTALL; legacy storage cleanup + changelog on UPDATE (104-113);
- `chrome.tabs.onRemoved` → broker cleanup + selected-text map GC (145-154).

### Message bus pattern
`@webext-core/messaging`'s `defineExtensionMessaging<Protocol>()`, one typed protocol module per concern under
`apps/app/lib/messaging/`:
- `runtime/runtimeMessages.ts` — `RuntimeMessageType` const map (`runtime.getTabId`, `runtime.authSuccess`,
  `runtime.stopAgent`), protocol type, exports `onRuntimeMessage` / `sendRuntimeMessage`.
- `server/serverMessages.ts` — `checkHealth`, `fetchMcpTools`.
- `sidepanel/openSidepanelWithSearch.ts` — `open(SearchActionStorage)`.
- Handlers are registered in the background: `onRuntimeMessage(RuntimeMessageType.getTabId, …)` (115-143),
  `onServerMessage('checkHealth'|'fetchMcpTools', …)` (156-177), `onOpenSidePanelWithSearch('open', …)` (81-102).

**Raw `chrome.runtime.onMessage` in the background is forbidden** and enforced by a test:
`lib/messaging/runtime/runtimeMessages.test.ts:37-44` asserts `entrypoints/background/index.ts` contains no
`chrome.runtime.onMessage.addListener`; lines 23-35 assert content scripts don't send raw `{type: …}` messages.

**To add a handler**: add the method to the protocol type in the relevant `lib/messaging/<area>/*.ts` (or a new
`lib/messaging/spaces/spacesMessages.ts`), then call `onXMessage('name', handler)` inside `defineBackground`.
For pure data, prefer a storage item + `.watch()` (no message needed at all).

---

## 4. Keyboard shortcuts

- **No `chrome.commands` anywhere** — no `commands` key in `wxt.config.ts`, no `chrome.commands.*` call in the
  codebase. Alt+A ("Toggle Agent") and Cmd/Ctrl+Shift+K/L are **native BrowserOS browser shortcuts**, surfaced to
  the extension via `chrome.sidePanel.browserosToggle` (`lib/browseros/toggleSidePanel.ts`).
- The only in-app shortcut system is a **documentation** list:
  `lib/constants/shortcuts.ts:4-32` (`SHORTCUTS_LIST` — key + per-OS modifier + description) rendered by
  `screens/newtab/index/ShortcutsDialog.tsx:17-66`, opened from `SidebarUserFooter` via
  `SidebarLayout.tsx:26-28,150-153`. `lib/useIsMac.ts` picks the modifier label.
- There is no global in-page key handler / hotkey library. A Spaces switcher (e.g. Ctrl+1..9, Cmd+Shift+S) needs
  either a new `commands` manifest block **plus** a `chrome.commands.onCommand` listener in the background, or a
  document-level `keydown` handler in `NewTabLayout` (page-scoped only). `cmdk` is already a dependency if a
  command-palette switcher is wanted.

---

## 5. Settings page

- Same SPA; entry is `app.html#/settings` (`wxt.config.ts:50-53`). Shell:
  `components/layout/SettingsSidebarLayout.tsx` (responsive sheet on mobile, fixed sidebar + `max-w-4xl` main).
- Nav model: `components/sidebar/SettingsSidebar.tsx:58-85` — `NavSection[]` of `NavItem`s
  (`{ name, to, icon, feature? }`), grouped "Provider Settings" / "Other", optionally gated by a
  `Feature` capability (`lib/browseros/capabilities.ts` + `modules/browseros/capabilities.hooks`).
- Page pattern: `screens/customization/CustomizationPage.tsx:5-12` is a thin page composing
  `CustomizationHeader` + card components. Cards own their own persistence:
  `screens/customization/ToolbarSettingsCard.tsx:22-46` reads/writes **native browser prefs** through
  `getBrowserOSAdapter().getPref/setPref` with `BROWSEROS_PREFS` keys; other screens use `@wxt-dev/storage` or the
  GraphQL/REST query lanes.
- Forms: `react-hook-form` + a single `zod` schema (import `z` from `zod/v3`) + shadcn `Form` set —
  reference `screens/connect-mcp/AddCustomMCPDialog.tsx`, `screens/ai-settings/NewProviderDialog.tsx`.
- **To add a Spaces settings section**: new `screens/spaces-settings/SpacesSettingsPage.tsx`, a `<Route
  path="spaces">` inside the `/settings` block of `entrypoints/app/App.tsx:76-90`, and a `NavItem` in
  `SettingsSidebar.tsx`'s "Other" section.

---

## 6. ACP / Claude Code

### Layers
1. **`packages/acpx-ai-provider`** — in-repo fork of `acpx-ai-provider` (MIT, by Dani Akash; see
   `PROVENANCE.md`). A Vercel **AI SDK v7 `LanguageModelV2`** implemented over the `acpx/runtime` ACP client.
   Key files: `src/provider.ts` (`AcpxProvider`, session handles, `ensureSession`, usage events),
   `src/language-model.ts`, `src/convert-events.ts`, `src/convert-prompt.ts`, `src/mcp-servers.ts`,
   `src/json-output.ts`, `src/errors.ts`. `acpx` and `ai` are **peer** deps (`package.json:20-23`).
   Defaults: `DEFAULT_PERMISSION_MODE = 'approve-reads'`, `DEFAULT_NON_INTERACTIVE = 'deny'`
   (`src/provider.ts:27-28`); sessions default to `'persistent'` keyed `"<agent>::<cwd>"` (`provider.ts:96,122-128`).
2. **Server glue** — `apps/server/src/lib/agents/`:
   - `host-acp/config.ts:21-32` — the adapter table. **Claude Code is launched as
     `npx -y @agentclientprotocol/claude-agent-acp@^0.75.1` (bin `claude-agent-acp`)**; Codex as
     `@agentclientprotocol/codex-acp@^1.10.0`. Full-access mode ids: `claude → ['bypassPermissions']`,
     `codex → ['agent-full-access','full-access']` (lines 35-40).
   - `host-acp/launcher.ts:37-111` — **binary/path detection**: prefer a **bundled Bun**
     (`resolveBundledBun({resourcesDir, platform})`, `bundled-bun.ts`) and spawn
     `<bun> x --bun --silent --package <spec> <bin>` (`source: 'bundled-bun'`); otherwise fall back to host `npx`
     (`source: 'host-npx-fallback'`, Windows gets `windowsNpxArgv`). Custom agents shell-split the user's command
     (`parse-command.ts`) and get the **login-shell PATH merged in** (`resolve-login-path.ts`) so a GUI-launched
     server still finds homebrew/nvm binaries (`launcher.ts:113-152`). `bundled-native-binary.ts` prepends bundled
     native tools to PATH.
   - `acp/acp-agent-policy.ts:44-85` — builds `{adapter, cwd, sessionKey, agentRegistryOverrides, mcpServers,
     sessionOptions, fullAccessModeCandidates}`. Claude gets `systemPrompt: { append: BROWSEROS_ACP_INSTRUCTIONS }`
     (lines 98-103); Codex gets `CODEX_CONFIG` env JSON with browser plugins disabled (lines 116-147). `cwd` is the
     agent's `workingDirectory` or the shared `acpWorkspaceDir(browserosDir)` that holds the CLAUDE.md/AGENTS.md
     copy of the instructions (`acp/browseros-instructions.ts`).
   - `acp/mcp-servers.ts:20-49` — **what passes through**: always an HTTP MCP server named `browseros` at
     `http://127.0.0.1:<serverPort>/mcp` (+`?read_only=1` when read-only) carrying the
     `BROWSEROS_TOOL_LEASE_HEADER` lease token; plus any user `customMcpServers` from the browser context
     (a server literally named `browseros` is skipped). So the agent gets browser tools (tabs, windows, tab groups,
     snapshot, act, screenshot, … from `crates/browseros-mcp/src/tools/`) over MCP, leased per conversation.
   - `acp/acp-agent-runtime.ts` — streaming runtime; `storage/acp-agent-store.ts` — agents are rows in the shared
     `providers` table with `kind = 'acp'` (SQLite/Drizzle), created with a generated id.
   - `api/routes/acpx-probe.ts:42-70` — `POST /acpx/probe` ("Test connection"), body
     `{type, command?, env?, cwd?, timeoutMs?}`; `command` required for `type: 'custom'`.
   - `api/services/chat-service.ts:126-128` routes a request down the ACP path only when
     `request.target.type` is `'claude' | 'codex' | 'custom'`; `'browseros'` stays on the LLM path.
3. **Extension UI** — `apps/app`:
   - `modules/agents/agents.hooks.ts` (Hono RPC client against `<agentServerUrl>/agents`, TanStack Query,
     gated on `Feature.AGENT_HARNESS_SUPPORT`), `modules/agents/acp-agent-types.ts`,
     `modules/agents/acp-agent-probe.hooks.ts:15-67` (`useProbeCustomAgent`, `useAcpAgentProbe` → `/acpx/probe`).
   - Settings UI: `screens/ai-settings/` — `NewCodingAgentDialog.tsx`, `CustomCodingAgentDialog.tsx`,
     `CustomAgentTile.tsx`, `PopularAcpAgentsDialog.tsx` + `popular-acp-agents.ts` (opencode, Hermes, OpenClaw, pi…),
     `coding-agents.hooks.ts`, `ConfiguredTargetsList.tsx`.
   - Selection model: `modules/chat/sidepanel-chat-targets.ts` — a chat target is
     `{kind:'llm'|'acp', id, …}`, persisted as a `SidepanelChatTargetSelection` storage item and shared between
     new tab, sidebar and settings.

**Default or opt-in?** Opt-in. `screens/ai-settings/default-chat-target.helpers.ts:20-42` resolves the effective
target to the persisted selection only if that row still exists, **otherwise falls back to an LLM provider**
(`resolveDefaultProviderId`). A user must add a coding agent in Settings → AI & Agents (and the
`AGENT_HARNESS_SUPPORT` capability must be present) before Claude Code can be selected.

---

## 7. Dev loop

`bun run dev:watch` → `./tools/dev/run.sh watch` (`package.json:13`).

`tools/dev/run.sh`:
1. Hard-fails if `go` is absent (install hint `brew install go`).
2. Requires `cargo` only for `watch --claw --rust`.
3. `make -sC tools/dev` → `go build -o browseros-dev .` (`tools/dev/Makefile`), then `exec ./browseros-dev "$@"`.

Go supervisor `tools/dev/` (cobra; `cmd/`, `proc/`, `browser/`, `server/`). `cmd/watch.go:runWatch` (line 50):
- `ensureLimactlPresent()` (`watch.go:615-623`) — **`limactl` must be on PATH for every `watch`, even plain
  BrowserOS mode**; error says `brew install lima`.
- `proc.FindMonorepoRoot()`; ports from `config.dev.json` via `resolveTargetPorts` — **CDP 9005, server 9105,
  extension 9305** (`config.dev.json`, `.env.development.example:16-22`); `--claw` overrides server to 9200.
- `--new`: random free ports in 9000-9999 + fresh temp profile (`os.MkdirTemp "browseros-dev-"`). Without it:
  kills whatever holds the preferred ports, kills BrowserOS processes on that profile, falls back if busy
  (`watch.go:97-142`). A `WatchRunLock` keyed on mode+profile+ports prevents two supervisors on one profile.
- `runDevSetup` (`cmd/setup.go:60-80`): always `bun install --frozen-lockfile`, then `bun run codegen:agent`
  unless `apps/app/generated/graphql/{gql.ts,graphql.ts,schema.graphql}` all exist.
- `proc.BuildEnv` (`proc/ports.go:163-172`) exports `BROWSEROS_CDP_PORT`, `BROWSEROS_SERVER_PORT`,
  `BROWSEROS_EXTENSION_PORT`, `NODE_ENV=development`; `buildWatchEnvWithBinaryResolution` adds
  `BROWSEROS_USER_DATA_DIR` and `BROWSEROS_PRODUCT` (`watch.go:243-262`).
- `startBrowserOSWatch` (`watch.go:324-383`) starts, in order:
  1. `apps/app`: `bun --env-file=../../.env.development wxt` (WXT dev + HMR; it launches the browser),
  2. `apps/app`: `bun run dev:web` → `serve dist/chrome-mv3-dev -p 5175` (plain-URL preview of extension pages),
  3. waits for CDP, then `apps/server`: `bun --watch --env-file=../../.env.development src/index.ts --config
     <userDataDir>/…/browseros-server sidecar config` (written fresh by `BeforeStart`, port killed first).
  With `--manual` it instead builds the extension statically (`wxt build --mode development`) and launches
  Chromium itself via `browser.BuildArgs`.

**Hard-coded /Applications paths**:
- `apps/app/web-ext.config.ts:84-88` — `binaries.chrome = env.BROWSEROS_BINARY || '/Applications/BrowserOS.app/Contents/MacOS/BrowserOS'`.
- `tools/dev/browser/args.go:24-25` — `BrowserOSBinaryPath = "/Applications/BrowserOS.app/Contents/MacOS/BrowserOS"`,
  `BrowserClawBinaryPath = "/Applications/BrowserOS neo.app/Contents/MacOS/BrowserOS neo"`.
- `.env.development.example:11` sets `BROWSEROS_BINARY` to the same path.

**Extension reload**: WXT dev server + HMR; `keepProfileChanges: true` and a worktree-scoped Chromium profile
(`web-ext.config.ts:16-43`, `$TMPDIR/browseros-dev-<label>-<hash>`, overridable by `BROWSEROS_USER_DATA_DIR`).
Chromium is launched with `--disable-browseros-server --disable-browseros-extensions --test-type`,
`--browseros-product=…` and `--remote-debugging-port/--browseros-*-port` from the env (lines 55-81),
start URL `chrome://newtab`. Self-inspection of extension pages: `bun scripts/dev/inspect-ui.ts …` with
`BROWSEROS_CDP_PORT` (see `apps/app/CLAUDE.md`, "Self-testing UI changes").

**What breaks on a fresh machine**
1. No BrowserOS.app in `/Applications` → web-ext cannot launch; set `BROWSEROS_BINARY`.
2. No Go → `run.sh` exits before anything runs; the Go binary is built on every invocation.
3. **No `limactl` → `watch` aborts even though plain BrowserOS mode never touches the VM** (`watch.go:65`).
4. No `.env.development` → both `wxt` and the server are started with `--env-file=../../.env.development` and
   fail; copy `.env.development.example` (needs at least `VITE_PUBLIC_BROWSEROS_API` — `wxt.config.ts:13-17`
   parses it at config load and throws otherwise).
5. `bun install --frozen-lockfile` on every watch → a stale/edited `bun.lock` aborts startup.
6. GraphQL codegen must succeed once (`apps/app/generated/graphql/`), else the app won't typecheck/build.
7. Ports 9005/9105/9305 (and 5175 for `dev:web`) must be free, or use `dev:watch:new`; only one watch per profile.
8. `--claw` additionally needs `cargo`; `bunfig.toml` sets `minimumReleaseAge = 3 days` and
   `linker = "isolated"`, which can surprise fresh `bun add`s.

Related scripts: `dev:stop` (`pkill -f 'browseros-dev watch'`), `dev:setup`, `dev:cleanup`, `dev:reset`
(`cmd/reset.go` handles Lima VM stop/delete), `test:env`.

---

## 8. Testing, lint, typecheck

- Framework: **`bun test`** (`bunfig.toml`: 30s timeout, isolated installer). No vitest/jest.
- Runner wrapper: `scripts/run-bun-test.ts` spawns **one process per test file** to stop `mock.module()` leakage;
  aggregates JUnit XML. `apps/app`'s `test` script = `wxt prepare` then
  `bun run ../../scripts/run-bun-test.ts --cwd=apps/app ./apps/app`.
- Suite orchestration: `bun run test` → `scripts/run-test-suite.ts all`; CI subset selection in `ci/affected-suites.ts`.
- **~70 test files in `apps/app`**, colocated `*.test.ts(x)` next to the code: e.g.
  `screens/ai-settings/*.test.ts(x)`, `screens/newtab/index/recent-sites.helpers.test.ts`,
  `screens/newtab/layout/route-utils.test.ts`, `modules/chat/*.test.ts`,
  `lib/messaging/runtime/runtimeMessages.test.ts`, `web-ext.config.test.ts`. Components are tested as
  `.test.tsx` (e.g. `ConfiguredTargetsList.test.tsx`), but most tests target extracted `*.helpers.ts`.
- `bun run check` = `bun run lint && bun run typecheck && bun run fallow`
  — Biome 2.5.11 (`bunx @biomejs/biome check`; `noUnusedImports`/`noUnusedVariables` = error, `useSortedClasses`
  = error), `bun run --filter '*' typecheck` (per app: `wxt prepare && tsc --noEmit`), and `fallow check
  --baseline .fallow-baseline.json` (unused files/exports, cycles; `.fallowrc.jsonc` exempts `components/ui/**`
  and `components/ai-elements/**`, and the baseline grandfathers the upstream dead code we keep for rebase
  cheapness — regenerate it with `fallow check --save-baseline .fallow-baseline.json` after upstream work).
  Fix formatting with `bun run lint:fix`.

---

## 9. Recommendation — files to create/modify for Spaces

1. **`apps/app/lib/spaces/spaces-storage.ts`** (new) — `storage.defineItem<Space[]>('local:spaces', {fallback: []})`
   and `storage.defineItem<string|null>('local:activeSpaceId', {fallback: null})`; `Space = {id, name, emoji|color,
   tabGroupId?, pinnedUrls: string[], createdAt, updatedAt}`. Model it on
   `lib/workspace/workspace-storage.ts:13-21`; use `nanoid` for ids (already a dep).
2. **`apps/app/lib/spaces/spaces.helpers.ts` + `spaces.helpers.test.ts`** (new) — pure create/rename/reorder/
   assign-tab logic with no `chrome.*` calls, so it is unit-testable under `bun test` (pattern:
   `screens/newtab/layout/route-utils.ts` + its test).
3. **`apps/app/modules/spaces/spaces.hooks.ts`** (new) — `useSpaces()` / `useActiveSpace()` following
   `lib/personalization/personalizationStorage.ts:11-54` (getValue on mount + `.watch()` + debounced write);
   add `modules/spaces/spaces.revision.ts` mirroring `modules/schedules/schedules.revision.ts` if background
   writes must invalidate UI queries.
4. **`apps/app/lib/messaging/spaces/spacesMessages.ts`** (new) — `defineExtensionMessaging<SpacesProtocol>()` with
   e.g. `switchSpace({spaceId})`, `moveTabToSpace({tabId, spaceId})`; export `onSpacesMessage`/`sendSpacesMessage`.
   Never add a raw `chrome.runtime.onMessage` listener — `lib/messaging/runtime/runtimeMessages.test.ts:37-44`
   fails the build.
5. **`apps/app/entrypoints/background/spaces.ts`** (new) + registration in
   **`apps/app/entrypoints/background/index.ts`** (call it inside `defineBackground`, near lines 69-73) — owns
   `chrome.tabGroups`/`chrome.tabs`/`chrome.windows` work: create or recolor a tab group per space, hide/show
   groups on switch, persist tab→space mapping, and clean up on `chrome.tabs.onRemoved` (line 145).
6. **`apps/app/components/spaces/SpacesBar.tsx`** (+ `SpaceTab.tsx`, `NewSpaceDialog.tsx`) (new) — built from
   `components/ui/` primitives (Tabs/DropdownMenu/Dialog + `react-hook-form` + `zod/v3`); render it in
   **`apps/app/screens/newtab/layout/NewTabLayout.tsx:11-16`** above `<Outlet/>`, and/or a compact list in
   **`apps/app/components/sidebar/SidebarNavigation.tsx:26-39`**.
7. **`apps/app/wxt.config.ts`** (modify) — `tabGroups` and `tabs` are already permitted; **add a `commands` block**
   (e.g. `spaces-next`, `spaces-prev`, `spaces-1..9`) beside `action` (lines 54-62) if OS-level shortcuts are
   wanted, and add `chrome.commands.onCommand` handling in the background module from item 5. `sessions` would
   only be needed for restoring closed-tab state.
8. **`apps/app/lib/constants/shortcuts.ts`** (modify, lines 4-32) — append the Spaces shortcut entries so
   `ShortcutsDialog` documents them.
9. **`apps/app/screens/spaces-settings/SpacesSettingsPage.tsx`** (new) + route in
   **`apps/app/entrypoints/app/App.tsx`** `/settings` block (lines 76-90) + nav item in
   **`apps/app/components/sidebar/SettingsSidebar.tsx:70-85`** ("Other" section) — manage/reorder/delete spaces,
   default-space toggle. Follow `screens/customization/CustomizationPage.tsx:5-12` (thin page + cards).
10. **`apps/app/lib/constants/analyticsEvents.ts`** (modify) — add `/** @public */ SPACE_CREATED_EVENT =
    'ui.space.created'` etc. (`<area>.<entity>.<action>`, SCREAMING_SNAKE ending `_EVENT`) and call `track()` with
    the constants, never raw strings.
11. **Tests** (new) — `lib/spaces/spaces.helpers.test.ts`, `modules/spaces/*.test.ts`, and a
    `components/spaces/SpacesBar.test.tsx` if the component holds logic; then run
    `cd apps/app && bun run test` and, from the root, `bun run check`.
12. **Optional, only if the agent must see spaces** — extend `ChatRequestBrowserContext` in
    `apps/app/lib/messaging/server/buildChatRequestBody.ts:22-39` with the active space, and correspondingly
    `@browseros/shared/schemas/browser-context` on the server side. Not required for a UI-only Spaces feature.
