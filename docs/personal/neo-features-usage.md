# neo features: practical usage + architecture

Scope: running neo's `apps/claw-app` (WXT extension) and `apps/claw-server-rust` alongside BrowserOS
classic in one browser, as a single user. Paths are relative to the repo root
`/Users/jawaid/Documents/Personal/Browser`; `pba/` = `packages/browseros-agent/`.
Everything is loopback-only — the server binds `127.0.0.1` (`pba/apps/claw-server-rust/src/main.rs:124`).

---

## 1. One-click IDE connect (MCP)

### The endpoint

- One MCP server, one URL, Streamable HTTP transport. `public_mcp_url()` = `public_base_url() + "/mcp"`,
  and `public_base_url()` = `http://127.0.0.1:{proxy_port.unwrap_or(server_port)}` —
  `pba/apps/claw-server-rust/src/config.rs:221-231`. The Chromium-assigned **proxy port** is the
  source of truth in a packaged browser; the direct server port is only used in dev.
- Defaults: server `9200`, CDP `49337`, proxy unset (`config.rs:11-12`, `:166`). So the canonical
  shape is `http://127.0.0.1:<proxyPortOrServerPort>/mcp`, e.g. `http://127.0.0.1:9200/mcp`.
- **No token, no header.** `auth.token` exists in the sidecar schema (`config.rs:129-133`, `:181`)
  and is parsed into `Config.auth_token`, but nothing consumes it — no middleware reads it, and
  `spec_for` writes an empty header map (`services/harness.rs:705-708`).

### What "Connect" writes for Claude Code

- Server entry name: `browser` (`BROWSEROS_MCP_SERVER_NAME`, `services/harness.rs:27`). Legacy
  names `browseros-neo`, `browseros`, `BrowserOS neo` and `BrowserClaw` are recognized and migrated
  onto `browser` (`BROWSEROS_LEGACY_MCP_SERVER_NAMES`).
- Config file: `$CLAUDE_CONFIG_DIR/.claude.json`, else `$HOME/.claude.json`
  (`pba/crates/harness-integrations/src/catalog.rs:239-247`); the first *existing* candidate wins
  (`mcp/paths.rs:29-44`). Written at the **top level** under `mcpServers` (catalog.rs:250).
- Because Claude Code supports HTTP, `spec_for` emits an HTTP spec, not an stdio/`mcp-remote` shim
  (`services/harness.rs:699-714`). Resulting JSON:

```json
{
  "mcpServers": {
    "browser": {
      "type": "http",
      "url": "http://127.0.0.1:9200/mcp"
    }
  }
}
```

- The explicit `"type"` tag is mandatory for Claude Code (catalog.rs:252-259, note at :268-271:
  without it Claude Code warns "url but no type" and skips the entry). Field names default to
  `url` / `headers` (`pba/crates/harness-integrations/src/mcp/emitter.rs:79-83`).
- Writes are surgical — `json_add` (emitter.rs:330-351) edits in place and preserves siblings and
  comments, so existing `~/.claude.json` projects/history survive.

### Link / unlink semantics

- `PUT /api/v1/connections/{harness}` → connect, `DELETE` → disconnect (`api/http/mod.rs:86-90`,
  `api/http/connections.rs:27-55`).
- **Link** (`connect_browseros`, `services/harness.rs:295-389`): migrates legacy identities, upserts
  the `browser` entry into the harness config, records the link in neo's own manifest
  (`~/.browserclaw/mcp-manager/manifest.json`, `app.rs:90` + `mcp/io.rs:161`), then reconciles the
  managed skill onto disk for that harness. Foreign entries neo did not write are refused, not
  clobbered (`ManagerError::ForeignEntry`, harness.rs:317-319).
- **Unlink** (`disconnect_browseros`, harness.rs:391-453): removes every known server name
  (`browser`, `browseros-neo`, `browseros`, `BrowserOS neo`, `BrowserClaw`) from the harness config, drops the manifest row,
  and re-reconciles the skill so the unlinked harness loses it.
- The UI row is a toggle and shows the config path it wrote
  (`pba/apps/claw-app/screens/mcp/ConnectionRow.tsx:41`, `:60-62`).
- On server start, `first_run_connect` links every installed harness once if nothing is linked yet
  (`main.rs:198`, harness.rs:513, `:1323`).

### Manual equivalent (Claude Code)

```bash
claude mcp add browser http://127.0.0.1:9200/mcp --transport http --scope user
```

This exact string is what the MCP screen offers to copy —
`buildCanonicalMcpCliCommand()`, `pba/apps/claw-app/modules/api/mcp-endpoint.ts:38-41`.
Substitute the real proxy port if it is not 9200.

### Other supported harnesses

`AgentId::ALL` (`pba/crates/harness-integrations/src/catalog.rs:22-30`), with system config paths:

| Harness | Config file (macOS) | Format |
|---|---|---|
| Claude Code | `$CLAUDE_CONFIG_DIR/.claude.json` → `~/.claude.json` | JSON, `mcpServers` |
| Codex | `~/.codex/config.toml` | TOML, `mcp_servers` |
| Cursor | `~/.cursor/mcp.json` | JSON, `mcpServers` |
| OpenCode | `$XDG_CONFIG_HOME/opencode/opencode.json` → `~/.config/opencode/opencode.json` | JSONC, injects `type: local`/`enabled` |
| Antigravity | `~/.gemini/config/mcp_config.json` | JSON, uses `serverUrl` not `url` |
| VS Code | `~/Library/Application Support/Code/User/mcp.json` | JSON, `servers`, `type` tagged |
| Zed | `~/.config/zed/settings.json` | JSON, injects `source: custom`, `enabled: true` |

Claude Desktop / Cowork is not on the board — it uses a `.mcpb` bundle instead
(`pba/apps/claw-app/screens/mcp/install-guide.data.ts:8`, `docs/neo/mcp/claude-desktop.mdx`).
Anything else: paste the URL manually (`docs/neo/mcp/manual.mdx`).

---

## 2. Agent tab isolation

### Group creation, title, color

- Grouping is an MCP **effect** fired after any `tabs` call that opened a new page
  (`api/mcp/effects/tab_groups.rs:27-45`, registered at `api/mcp/dispatch.rs:196`). Create call is
  `{"action":"create","pages":[page_id],"title":<title>}` (tab_groups.rs:167-173) → CDP
  `Browser.createTabGroup` (`pba/crates/browseros-mcp/src/tools/tab_groups.rs:144`); later tabs use
  `addTabsToGroup` with the remembered `groupId` (tab_groups.rs:141).
- **Title template**: `"{clientPrefix}/{sessionLabel}"` (`api/mcp/naming.rs:99-111`). Prefix from the
  agent slug (≤3 segments, ≤20 chars, trailing version digits stripped, fallback `agent`,
  naming.rs:33-41); label is a generated two-word handle or a user rename (≤3 words, ≤32 chars,
  lowercased, hyphen-joined). Examples: `claude-code/invoice-processing`, `codex/agile-alpaca`.
- **Color**: deterministic FNV-1a hash of the agent slug mod 8
  (`services/browser/tab_groups.rs:41-47`), palette
  `[Grey, Blue, Yellow, Green, Pink, Purple, Cyan, Orange]` — **Red deliberately excluded**. Colour is
  re-asserted with an `update` right after create (tab_groups.rs:201-207). Same agent → same colour.

### Lifecycle / when it closes

- Session ends → the group is **collapsed**, not closed (`finish_teardown` →
  `RetainedGroupAction::Collapse`, `services/sessions/manager.rs:511`; tab_groups.rs:235-277).
- Idle sweep tears down sessions idle longer than `session_idle` (`sweep_idle`, manager.rs:399).
  After `session_retention` past `ended_at`, `reap_retained` (manager.rs:539-586) issues
  `{"action":"close"}` → `Browser.closeTabGroup`, **which closes every tab in the group**.
- A second, SQLite-backed sweep closes orphaned individual agent tabs across restarts —
  `services/tab_cleanup.rs:38-101`, ticked from `runtime.rs:66`. It re-checks per-tab ownership and
  spares the active/foreground tab (tab_cleanup.rs:92).
- On boot, `session_tabs.release_all_open()` (`app.rs:73`, `db/session_tabs.rs:284`) stamps every
  open claim released, so surviving agent tabs close one retention window later. The in-memory
  `groupId` is lost, so the old *group* is never explicitly closed; it just empties out.
- Knobs (`config.rs:13-16`, read at `:192-206`): `CLAW_SESSION_IDLE_MS` (30 min),
  `CLAW_SESSION_RETENTION_MS` (60 min), `CLAW_SESSION_SWEEP_INTERVAL_MS` (60 s). CDP group ops time
  out after 10 s (tab_groups.rs:450).

### How the agent is told which tabs are yours

- State: `PageOwnership { page_owners: HashMap<PageId, ConvoId>, … }` plus a per-conversation
  `TabGroup { group_ref, color, collapsed, title }` — `services/sessions/tab_ownership.rs:61-88`,
  mirrored in SQLite `session_tabs` / `tab_claims`. Claims are recorded only for pages the agent
  itself opened (`api/mcp/effects/ownership_claims.rs:66-102`).
- `tabs list` results are rewritten with three fields per page: `ownership` ∈
  `"mine" | "user" | "other-agent"`, `ownerAgentId`, `ownerLabel` —
  `api/mcp/effects/tabs_list_view.rs:108-118`. Anything with no ownership record is classified
  `"user"` (`:97`). Text output buckets them under the literal headers `Your tabs:` /
  `User's tabs:` / `Other agents' tabs:` (`:126-130`).
- A guard rejects any tool call targeting a page this conversation does not own
  (`api/mcp/guards/page_ownership.rs:15-41`); unclaimed user pages are never auto-claimed.

### Interaction with a title-matched Spaces scheme

**Good news: nothing in neo matches tab groups by title.** Verified across
`apps/claw-server-rust/src`, `crates/browseros-mcp/src` and `apps/claw-app`:

- `group_ref` is only ever set from the `groupId` returned by neo's own `createTabGroup`
  (tab_groups.rs:186-200, `result_group_id` :478).
- The only `{"action":"list"}` call is `group_exists_unlocked` (tab_groups.rs:319-343), matching
  strictly on `groupId` and never reading titles; its only effect is clearing neo's stale ref.
- `desired_group_title` is only ever written, never compared. Collapse/close early-return unless neo
  already holds a groupId it created (tab_groups.rs:245-247, :287-289), with extra "is this still the
  current group" guards (tab_ownership.rs:236-303).

So a Spaces group titled `codex/travel-planning` will **not** be adopted, renamed, collapsed or
closed by neo's session machinery — the title collision is purely cosmetic. Real risks: see Gotchas.

---

## 3. Audit + replay

### What is recorded

- **rrweb DOM event stream** — `rrweb` + `rrweb-player` 2.1.1 (`pba/apps/claw-app/package.json:58-59`),
  config at `entrypoints/recorder.content.ts:90-101`: `maskInputOptions: { password: true }`,
  `recordCanvas: false`, sampling `{ mousemove: false, scroll: 250, media: 500, input: 'last' }`.
  `<all_urls>` at `document_start`, main frame only. Not full DOM snapshots — an incremental mutation
  stream with periodic re-snapshots.
- **Screenshots** — separate channel, one JPEG per tool dispatch (`services/screenshots.rs:59-73`).
  **Tool calls** — audit rows with agent id, title, site, tool sequence, dispatch/error counts, token
  estimates (`services/audit.rs:90-151`, `db/audit_log.rs:127-152`).
- **No network request/response recording anywhere.** No video.

### Where it is stored

Root: `BROWSERCLAW_DIR` env override, else `~/.browserclaw` (release) or `~/.browserclaw-dev`
(debug builds) — `config.rs:251-261`, constants `:18-19`. Sub-paths wired in `app.rs:64-100`:
`browserclaw.sqlite` (metadata, audit rows, sessions, skills);
`replays/<2-char shard>/<base64url(document_id)>.ndjson` for rrweb payloads
(`services/recordings/store.rs:278-283`, `:703-736`); `recordings/` (legacy NDJSON, store.rs:615);
`screenshots/s-<base64url(session_id)>/<screenshot_id>.jpg` (screenshots.rs:68-83); plus
`audit-retention.json`, `mcp-manager/`, `harness-integrations/`, `skills/`, `runtime.json`, `logs/`.

### Size

- **No compression** — plain UTF-8 NDJSON on disk. No zstd/gzip anywhere in the server crate.
- Client-side chunking: buffer cap 500 events, flush at 50 events / 2500 ms
  (`pba/apps/claw-app/modules/recorder/recorder-buffer.ts:34-36`); overflow drops the oldest event
  and sets a sticky `hasGap` flag (`:97-104`). Limits: `RECORDING_INGEST_MAX_BYTES` 16 MiB, fallback
  batch 2 MiB (`pba/packages/shared/src/constants/limits.ts:9,11`), enforced by `DefaultBodyLimit`
  (`api/http/mod.rs:35`).
- Sampling is the only real size reducer. ENOSPC triggers `recover_disk_space()`, dropping the
  oldest recording (store.rs:517-521, 553-563). Budget a few hundred MB for a week of daily use.

### Opening a replay

- Route `#/audit/:sessionId/replay` (`entrypoints/newtab/App.tsx:50-57`), reached from the
  **View Session Replay** button on the task detail page (`components/audit/TaskHeader.tsx:157-170`),
  gated on the recording having data.
- Endpoints (`api/http/mod.rs:69-81`): `GET /api/v1/sessions/{id}/recording` (metadata),
  `…/recording/events` (`application/x-ndjson`), `…/recording/live` (SSE bootstrap + tail), and
  `POST /api/v1/recordings/events` for ingest (origin-restricted, `mod.rs:169-178`).

### Retention / cleanup

- Settings file `<browserclaw_dir>/audit-retention.json` (`services/audit_settings.rs:15`, `:53`).
  The policy enum is the whole surface: `KeepForever | DeleteAfterDays { days }`, **default 7 days**
  (audit_settings.rs:16, 20-33). No enable/disable toggle, no max-size cap.
- HTTP: `GET /api/v1/audit/storage`, `PUT /api/v1/audit/retention`, `POST /api/v1/audit/cleanup`
  (`api/http/mod.rs:44-46`); UI is the "Manage audit files" dialog.
- Hourly sweeper (`runtime.rs:99-131`) deletes aged task rows, unlinks their screenshots, prunes
  recordings, reclaims DB pages. Unclaimed recording streams have a shorter 1 h orphan TTL
  (store.rs:30, 335-348).

---

## 4. Skills and skill runs

- Two kinds. **(a)** The managed product skill `browser`, shipped at
  `pba/resources/skills/browserclaw/SKILL.md` with a compiled-in fallback
  (`services/harness_skills.rs:13-15`) and a hand-install copy at repo-root
  `skills/browser/SKILL.md`. **(b)** User/agent skills, always namespaced `neo-*`.
- SKILL.md format: YAML frontmatter fenced by `---`. The only Rust parser is
  `parse_browserclaw_skill` (`harness_skills.rs:53-77`), requiring `name` and a non-empty
  `description`. User skills are *rendered*, never parsed back (`services/skills.rs:534-563`):

```markdown
---
name: neo-<name>
description: "<json-encoded>"
tools: browser
---

## Steps
1. Call the mark_skill_run tool with name: neo-<name> so this run is recorded.
2. ...

## Learned from past runs
- ...
```

- Name rules: `[a-z0-9-]+`, force-prefixed `neo-`, `browserclaw` reserved (skills.rs:21, 496-531).
- **Where user skills live**: canonical body at `~/.browserclaw/skills/<neo-name>/SKILL.md`
  (`app.rs:96-99`, `skills.rs:440-447`), plus a DB row in `skills` (`db/entities/skills.rs`) with
  `origin` ∈ `agent | manual | directory`.
- **Reconciled into harnesses**: `install_skill` (`services/harness.rs:246-264`) computes the
  consumer set = harnesses currently MCP-linked, then `SkillReconciler::reconcile`
  (`pba/crates/harness-integrations/src/skills/reconciler.rs:39`). Claude Code target is
  `$CLAUDE_CONFIG_DIR/skills` → `~/.claude/skills/<skill-name>/` (catalog.rs:280-286); Codex and Zed
  share `~/.agents/skills` and are deduped by physical path. Each installed dir gets a
  `.browserclaw-managed.json` ownership marker, so unowned dirs are never clobbered
  (`skills/manifest.rs:41-62`). State manifest: `~/.browserclaw/harness-integrations/skills.json`.
- `pba/skills-lock.json` is **unrelated** — nothing in the repo reads it; leftover from an external
  third-party skills installer.
- **Skill runs**: the agent calls the MCP tool `mark_skill_run` (`api/mcp/service.rs:64`, handler
  `:291-320`), upserting a `skill_run_marks` row keyed by session id. On session completion,
  `finalize` (`services/skill_runs.rs:65-85`) turns the mark into a `skill_runs` row with
  `run_number`, `agent_id`, `tokens`, `duration_ms`, `tool_count`, `clean`, `errored_tool`. Marking
  is MCP-only. Endpoints: `GET|POST /api/v1/skills`, `GET|PUT|DELETE /api/v1/skills/{name}`,
  `GET /api/v1/skills/{name}/runs` (`api/http/mod.rs:91-96`).
- **To add your own**: let the agent call `save_skill` mid-session, or
  `POST /api/v1/skills {"name":"weather","description":"…","steps":[…]}` (same as the Skills screen's
  form dialog). Connect the harness **first** — a skill created while nothing is linked gets an empty
  `linkedAgents`. Hand-dropping a file into `~/.browserclaw/skills/` creates no DB row and is
  invisible to neo.

---

## 5. Cockpit (claw-app newtab)

`HashRouter` mounted at `pba/apps/claw-app/entrypoints/newtab/App.tsx:17`; all routes except the
catch-all render inside `CockpitShell` (hover-expanding sidebar).

| Route | Screen | Polls |
|---|---|---|
| `#/` | Home: live agent cards, saved stats, recent activity | `GET /api/v1/sessions?status=live` 1.5 s; `/api/v1/connections` 5 s; `/api/v1/cockpit/stats` 3 s (only when idle); recent sessions 3 s; `/api/v1/sessions/{id}/preview` as `<img>` 1.5 s |
| `#/mcp` | Endpoint strip + per-harness connect rows | `GET /api/v1/connections` 5 s; `PUT`/`DELETE /api/v1/connections/{harness}` on click |
| `#/skills` | Skill list | `GET /api/v1/skills`, no polling |
| `#/skills/:name` | SKILL.md + run history | `GET /api/v1/skills/{name}`, `/runs`, no polling |
| `#/audit` | Full session log (filters in search params) | paginated `GET /api/v1/sessions`, no polling; storage dialog `GET /api/v1/audit/storage` 30 s |
| `#/audit/:sessionId` | Task detail: dispatches + screenshots | session 3 s **only while live**; screenshots 3 s |
| `#/audit/:sessionId/replay` | rrweb player | recording metadata 10 s; events refetched on revision change |
| `#/diagnostics` | Diagnostics (shared package) | `GET /system/diagnostics`, one-shot |
| `*` | redirect to `#/` | — |

- Every route also hits `GET /api/v1/settings/telemetry` once (`staleTime: Infinity`). `/audit*` is
  wrapped in `SensitiveRouteContent`, adding `ph-no-capture` so PostHog never records audit pages
  (`App.tsx:65`).
- **The newtab override is not required.** `chrome-extension://<id>/newtab.html#/audit` works:
  no handwritten `chrome_url_overrides` (WXT wires it automatically, `wxt.config.ts:5-7`), no
  top-level redirect, no "am I the newtab?" check. The only `chrome.*` calls are optional and guarded
  (`tabs.create` for help links, `tabs.update` to focus an agent tab, `browserOS.getPref` for
  ports/theme). It must still load from the `chrome-extension://` origin so loopback fetches are
  allowed. Dev override `newtab.html?apiUrl=http://127.0.0.1:9200#/audit` is honoured
  (`modules/api/browseros-ports.ts:32`).

---

## 6. Ports and config

### Server side

- `claw-server-rust` **requires** `--config <sidecar.json>` (Chromium authors it); the only other
  mode is `--version` (`config.rs:22-30`). Sidecar shape (`config.rs:97-135`):
  `{ ports: { server, cdp, proxy }, directories: { resources }, flags: { devMode },
  auth: { token }, replay: { retentionDays } }`.
- Resolution (`config.rs:157-171`): server → `9200`, cdp → `49337`, proxy → `None`. Binding is
  `127.0.0.1:server_port`; `AddrInUse` bails with "already running" rather than hunting for a free
  port (`main.rs:124-133`). `server_port: 0` works — the bound addr is read back.
- The server publishes `<browserclaw_dir>/runtime.json` with `{"url": "..."}` for external consumers
  (Codex, Claude Desktop bundle) — `services/runtime_file.rs:13,26-34`, `main.rs:149`. There is no
  `ports.json`.
- Server env vars: `BROWSERCLAW_DIR`, `HOME`, `CLAW_SESSION_IDLE_MS`, `CLAW_SESSION_RETENTION_MS`,
  `CLAW_SESSION_SWEEP_INTERVAL_MS`. **It reads no `BROWSEROS_*` variables at all.**

### Extension side — how claw-app finds the server

Resolution order (`pba/apps/claw-app/modules/api/browseros-ports.ts`, `modules/api/client.ts:12-17`):

1. `chrome.browserOS.getPref('browseros.server.server_port')` for the API base; MCP surfaces use
   `'browseros.server.proxy_port'` (browseros-ports.ts:11-12, 56, 64).
2. `?apiUrl=` on the URL, cached in `sessionStorage['browseros.claw-app.apiUrl']`.
3. That sessionStorage value.
4. `VITE_BROWSEROS_CLAW_API_URL` (build-time, dev watcher).
5. Fallback `http://127.0.0.1:9200`.

Non-pref sources are hardened to `http:` + `127.0.0.1` + explicit port + bare path
(`client.helpers.ts:11-28`). The client re-resolves on every call and swaps itself when the port
changes (`client.ts:44-56`).

### `BROWSEROS_*` env vars in claw-app

| Var | File | Meaning | Default |
|---|---|---|---|
| `BROWSEROS_BINARY` | `web-ext.config.ts:85` | Chromium binary for dev launch | `/Applications/BrowserOS.app/Contents/MacOS/BrowserOS` |
| `BROWSEROS_USER_DATA_DIR` | `web-ext.config.ts:40` | dev profile dir | worktree-scoped `/tmp/browseros-dev-…` |
| `BROWSEROS_PRODUCT` | `web-ext.config.ts:47-53` | `browseros` \| `browserclaw` → `--browseros-product=` | `browserclaw` |
| `BROWSEROS_CLAW_CDP_PORT` | `web-ext.config.ts:72` | `--remote-debugging-port` | unset (dev suggestion 49337) |
| `BROWSEROS_SERVER_PORT` | `web-ext.config.ts:75-80` | sets `--browseros-mcp-port`, `--browseros-server-port`, `--browseros-proxy-port` to one value | unset (dev 9105) |
| `VITE_BROWSEROS_CLAW_API_URL` | `browseros-ports.ts:47` | build-time API base | unset |

`BROWSEROS_MCP_SERVER_NAME` and friends in `packages/shared/src/constants/urls.ts` are TS constants,
not env vars, despite the prefix.

### Dev vs packaged

- `dev_mode` = sidecar `flags.devMode`, else `cfg!(debug_assertions)` (config.rs:171, 233-235). Debug
  build → `~/.browserclaw-dev`; release → `~/.browserclaw`; `BROWSERCLAW_DIR` overrides both
  (config.rs:251-261; a blank value is ignored).
- Consequence: a locally built debug server and the shipped browser keep **completely separate**
  databases, recordings, skills and MCP manifests — but write to the **same** harness config files
  (`~/.claude.json`, `~/.claude/skills/`), so they fight over the `browser` entry.

---

## Gotchas

1. **The agent has the raw `tab_groups` tool with no guard.**
   `pba/crates/browseros-mcp/src/tools/tab_groups.rs` exposes `list`, `create`, `update`, `ungroup`,
   `close` over *any* `groupId`, and `GUARDS` (`api/mcp/dispatch.rs:176-180`) has no tab-group guard
   — `page_ownership::guard` only fires on args carrying a `page` id. A model calling
   `tab_groups action=list` sees every Spaces group (title, colour, collapsed, members) and can
   `action=close` one, closing all your tabs in it. **This is the real Spaces exposure, not the title
   collision.**
2. **`Browser.closeTabGroup` closes member tabs.** Drag one of your own tabs into an agent's group and
   retention expiry closes it too — the group-close path has no per-tab membership check (contrast
   `tab_cleanup.rs:92`, which does re-check).
3. **Colour aliasing.** neo's palette is the full Chrome set minus Red, so agent groups will visually
   alias Spaces colours. Red is the only safe Spaces-only signal.
4. **`default_tab_group_id` reset** (`api/mcp/effects/tab_groups.rs:99-111`): if a new page's actual
   group differs from the remembered one, neo clears its ref and creates a fresh group. If BrowserOS
   auto-assigns new tabs into the active Space's group, every agent `tabs new` may spawn an extra
   `slug/label` group and fragment the tab strip. Grouping is also fire-and-forget
   (`drop(spawn_tab_group_work(...))`, tab_groups.rs:42) with no reconciliation loop, so it races any
   Spaces-side regrouping of the same tab.
5. **Restart leaves orphan groups.** The in-memory `group_ref` is lost; the group survives until its
   tabs are individually closed. If Spaces persists groups **by title**, an abandoned `codex/foo`
   group can be picked up by *our* code as a space — namespace Spaces titles, or filter out anything
   matching `^[a-z0-9-]{1,20}/`.
6. **Dev and packaged builds both write `~/.claude.json`.** `~/.browserclaw-dev` isolates data but not
   harness configs, so running both flips the `browser` URL between the dev port and the
   packaged proxy port. Disconnect one before using the other.
7. **`first_run_connect` auto-links every installed harness** on a fresh state dir (`main.rs:198`,
   `harness.rs:513`). Deleting `~/.browserclaw-dev` and restarting silently rewrites
   `~/.claude.json`, `~/.codex/config.toml`, `~/.cursor/mcp.json`, etc.
8. **No auth on the MCP endpoint.** Any local process can drive the browser via
   `http://127.0.0.1:<port>/mcp`; the `auth.token` sidecar field is parsed but unused.
9. **Recordings are uncompressed NDJSON, 7-day default retention, no size cap.** The only backstop is
   ENOSPC-triggered deletion of the oldest recording. Set retention explicitly in the Manage audit
   files dialog if disk matters.
10. **Two ports matter.** The extension uses `browseros.server.server_port`; the MCP endpoint handed
    to IDEs uses `browseros.server.proxy_port`. Missing proxy pref → IDEs get the raw server port,
    fine in dev but not what a packaged build should advertise.
