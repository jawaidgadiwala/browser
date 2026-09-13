# Whitelabel audit (2026-09-13)

Remaining upstream (BrowserOS / browserclaw) remnants that would leak in a shipped build. Paths are repo-relative. "Overridden" says whether an env var or flag already neutralises the default. Status column tracks fixes.

Order of work: B1, B2, B4, B5, B12 (silent phone-home in native builds) → B3, B7, B8, B9, B11 → A1–A5, A8, A9 (first-run visible) → C3, C4, C5, C7 (state/identity, migrations) → C1/C6 (bundle + binary rename, one coordinated change) → A6, A13, A14 (links/docs).

## B. Network endpoints, keys, feeds that phone upstream

| # | Where | Finding | Fix | Overridden |
|---|---|---|---|---|
| B1 | `packages/browseros/chromium_patches/chrome/browser/browseros/metrics/browseros_metrics_service.cc:41-45` | Hardcoded upstream PostHog project keys + `https://us.i.posthog.com/i/v0/e/`; annotation says it cannot be disabled in settings. Every native build reports `browseros.native.*` events upstream | Empty the key constants (empty ⇒ inert, like Sparkle) or drop the `metrics` feature from `.features.yaml` | No |
| B2 | `.../browseros/core/browseros_constants.h:241-243`, `chromium_patches/chrome/app/chrome_crash_reporter_client_win.cc:11` | Upstream Sentry DSN; native crash reports go to upstream | Blank the DSN (crashpad stays, uploads inert) or own project | No |
| B3 | `.../browseros/core/browseros_constants.h:30-46` (used by `extensions/browseros_extension_loader.cc:59,224`, `chrome/browser/extensions/extension_management.cc:51`) | Extension config + update feeds on `cdn.browseros.com` (`extensions.json`, `extensions.alpha.json`, `update-manifest.xml`, alpha). Browser silently pulls upstream CRXs over ours | Own feed host or empty; keep `--browseros-extensions-url` / `--disable-browseros-extensions` switches | Partial (switch exists, default upstream) |
| B4 | `chromium_patches/chrome/browser/win/winsparkle_glue.cc:57-63` | Windows appcasts hardcoded to `cdn.browseros.com/appcast-win*.xml`; a Windows build auto-updates into upstream's binary | Blank like macOS (`chrome/browser/mac/sparkle_glue.mm:41` has `kDefaultFeedBaseURL[] = ""`, the model) | No |
| B5 | `.../browseros/server/browseros_server_config.cc:30-48` | Sidecar server updater appcasts (`appcast-server*.xml`, `appcast-claw-server*.xml`) | Blank or repoint; `--browseros-server-appcast-url` / `--disable-browseros-server-updater` exist | Partial |
| B6 | `packages/browseros-agent/apps/app/lib/browseros-api-url.ts:1`, `apps/app/lib/llm-providers/storage.ts:88`, `apps/app/wxt.config.ts:14-44` | Hosted LLM default `https://api.browseros.com/v1`, model `browseros-auto`; manifest `externally_connectable` / `web_accessible_resources` derived from it | Empty default; drop the api/web host match patterns | Mostly (`hostedProviderEnabled()` false) but `VITE_PUBLIC_BROWSEROS_API` set in `.env.development` so host permissions still ship |
| B7 | `apps/server/src/env.ts:20,27`, `.env.development:80`, `.env.production.example:22`, `tools/dogfood/config/config.go:410`, `apps/server/src/api/server.ts:63` | `BROWSEROS_CONFIG_URL=https://llm.browseros.com/...`; server fetches upstream config at boot and uses its origin for CORS | Repoint or use the `browseros.invalid` sentinel from `scripts/build/server/descriptor.ts:19` | No, actively configured |
| B8 | `packages/shared/src/constants/urls.ts:17-19` | `CDN`, `KLAVIS_PROXY` (`llm.browseros.com/klavis`, upstream sees every managed-connector call), `POSTHOG_DEFAULT` | Own proxy or disable managed integrations; drop CDN | No |
| B9 | `apps/claw-app/components/cockpit/cockpit-videos.ts:37` | Cockpit onboarding video streamed from `cdn.browseros.com` | Self-host or remove | No |
| B10 | `apps/claw-server-rust/src/analytics/service.rs:20-50`, `scripts/build/claw-server-rust/descriptor.ts:24-27` | PostHog in Rust server; `CLAW_POSTHOG_KEY` required by build descriptor, host `us.i.posthog.com` | Keep key empty (no-op) and relax `requiredInlineEnvKeys`, or delete module | Yes for our builds (keys empty) but `--product browserclaw` still requires the var |
| B11 | `packages/browseros/bos_build/core/context.py:209`, `release/prepared_resources.py:30`, `release/feeds/spec.py:22`, `release/extensions/build.py:21`, `release/plan.py:605`, `lib/env.py:198-199`, `.env.example:25` | Release pipeline defaults to `cdn.browseros.com`; `--resource-mode published` downloads upstream CRXs | Own `R2_CDN_BASE_URL` / manifest URL; source mode only | Partial |
| B12 | `bos_build/release/extensions/specs.py:95-118`, `bos_build/products/browseros/product.py:33`, `browseros_constants.h` `kBrowserOSExtensions` | Bundled bug reporter (`adlpneommgkgeanpaekgoaolcpncohkf`) + controller built from upstream repos; bug reporter required and pinned; reports go upstream | Drop bug reporter from required extensions and constants, or fork | No |
| B13 | `updates/**` | Checked-in upstream feeds pointing at upstream releases | Regenerate for own CDN or delete until we have a feed | No |
| B14 | `apps/cli/update/manager.go:13`, `apps/cli/scripts/install.sh:13`, `install.ps1:23`, `scripts/build/cli/release-policy.ts:7-9` | CLI self-update/install from `cdn.browseros.com/cli` | Repoint or exclude CLI from release | No |
| B15 | `apps/server/src/lib/clients/oauth/providers.ts:31,38,45,55`, `codex-fetch.ts:34` | Upstream-registered OAuth client ids (ChatGPT, GitHub, Qwen), `originator: 'browseros'` | Register own OAuth apps (user action); verify Codex accepts a custom originator | No |

## A. User-visible branding

| # | Where | Finding | Fix | Overridden |
|---|---|---|---|---|
| A1 | `apps/claw-app/wxt.config.ts:11,25` | Cockpit ext name/description "BrowserOS neo" | Route through `apps/claw-app/lib/personal/product.ts`; add description constant | Name only when embedded; description never |
| A2 | `apps/app-onboard/src/onboarding/components/VisualRail.tsx:31`, `steps/WelcomeStep.tsx:16`, `steps/SetupStep.tsx:34`, `steps/ImportStep.tsx:327`, `steps/SetupAgentStep.tsx:103`, `components/MacKeychainNotice.tsx:17`, `index.html:7` | First-run onboarding says "Welcome to BrowserOS", "BrowserOS Helper wants to use..." | Add a product module mirroring `apps/app/lib/personal/product.ts`; keychain string must match real helper name | No |
| A3 | `apps/claw-onboard/src/onboarding/components/VisualRail.tsx:31`, `components/MacKeychainNotice.tsx:17` | "BrowserOS neo" | Same | No |
| A4 | `apps/claw-app/components/cockpit/ProductHuntBanner.tsx` (rendered at `screens/cockpit/Cockpit.tsx:76,90`) | Upstream marketing banner | Delete or gate like classic (`showUpstreamPromos()`) | No |
| A5 | `apps/claw-app/screens/mcp/install-guide.data.ts:19,90,93`, `screens/cockpit/cockpit-onboarding.helpers.ts:77`, `components/sidebar/SidebarHelp.tsx:25` | "BrowserOS neo" copy, docs links to upstream | Product constant; own docs or drop link | No |
| A6 | `apps/app/lib/constants/productUrls.ts:4-56`, `productWebHost.ts:4`, `lib/changelog/changelog-config.ts:1`, `screens/mcp-settings/MCPServerHeader.tsx:25`, `screens/sidepanel/index/ChatError.tsx:107`, `components/sidebar/SettingsSidebar.tsx:110`, `SidebarUserFooter.tsx:42`, `lib/llm-providers/providerTemplates.ts:57-133`, `apps/server/src/agent/chat-error.ts:40` | Docs/Privacy/Discord/Slack/changelog links go to upstream properties | Personal `productUrls` override; repoint or hide | No |
| A7 | `chromium_patches/chrome/browser/resources/settings/about_page/about_page.ts:10` | About → Help opens `http://docs.browseros.com/` | Own docs or restore `openHelpPage()` | No |
| A8 | `bos_build/core/products.py:132-134` defaults, `products/browseros/product.py` | `homepage_url`, `support_url`, `bugtracker_url` upstream, baked into About/metainfo/installer | Override the three in `products/browseros/product.py` | No |
| A9 | `packages/browseros/resources/browseros/icons/default_100_percent/product_logo_name_22*.png`, `default_200_percent/` pair, `icons/mac/Assets.car`, `icons/mac/Assets.xcassets/**`, `icons/linux/product_logo_32.xpm`, `icons/win/app_list.ico` | Still upstream originals (wordmark PNGs, Assets.car, Linux/Windows fallbacks) | Regenerate from `branding/` | No |
| A10 | `apps/claw-server-rust/src/services/skills.rs:26` | Saved skills auto-prefixed `neo-` | Drop prefix (migrate rows) | No |
| A11 | `apps/server/src/agent/prompt.ts:30,33`, `agent/chat-error.ts:179` | System prompt "You are BrowserOS…"; "BrowserOS credits" copy | `PRODUCT_NAME`; drop dead credits copy | No |
| A12 | `apps/server/src/tools/filesystem/read.ts:108,116,165-173`, `tools/filesystem/path-boundary.ts:42,130,139` | Tool text "BrowserOS-generated tool output" | Product constant | No |
| A13 | `README.md` | Upstream marketing README | Replace with ours (`README.personal.md` exists); keep `README.BrowserOS.md` | n/a |
| A14 | `skills/browser/SKILL.md:18-20`, `packages/browseros-agent/resources/skills/browserclaw/SKILL.md` | Docs URLs and "use browserclaw" wording | Repoint; keep aliases only as triggers | Dir already `browser` |

## C. Identifiers

| # | Where | Finding | Fix | Overridden |
|---|---|---|---|---|
| C1 | `bos_build/products/browseros/product.py:28,43,50-52` | `display_name="BrowserOS"` ⇒ `BrowserOS.app`, `Contents/MacOS/BrowserOS`, `BrowserOS Framework.framework`, dmg prefix, Linux dir | Flip `display_name` / `artifact_prefix` / `framework_name` to `Browser` together with `tools/personal/config.ts` and `apps/claw-app/web-ext.config.ts:89` | Bundle id, company, volume name already ours |
| C2 | `bos_build/products/browseros/product.py:34` | Required-extension labels "BrowserOS agent/bug reporter" | Rename; see B12 | No |
| C3 | `packages/shared/src/constants/paths.ts:10-18`, `apps/claw-server-rust/src/config.rs:18-19`, `crates/browseros-mcp/src/output_file.rs:31-33` | State dirs `~/.browseros`, `~/.browserclaw`, db `browseros.sqlite` | `~/.browser` with one-time migration | Env overrides only |
| C4 | `crates/harness-integrations/src/skills/manifest.rs:14,53,60`, `skills/reconciler.rs:565,632` | Marker `.browserclaw-managed.json`, `managedBy: "browserclaw"` written into users' agent config dirs | `.browser-managed.json` / `"browser"` with legacy migration | No |
| C5 | `apps/claw-server-rust/src/services/skills.rs:21` | `RESERVED_SKILL_NAMES = ["browserclaw"]`; should reserve `browser` (live collision bug) | Reserve `browser` | No |
| C6 | `apps/claw-server-rust/Cargo.toml:13`, ServerBundle blocks in `bos_build/products/*/product.py` | Binaries `browseros-claw-server*`, `browseros-server`, resource path `BrowserClawServer` | Rename in lockstep across Cargo, ServerBundle, sidecar path patch | No |
| C7 | `apps/claw-server-rust/src/api/mcp/service.rs:58` | MCP session key `com.browseros.neo/session` | `com.jawaidgadiwala.browser/session` | MCP server name already `browser` |
| C8 | `apps/cli/npm/package.json:2-8`, `apps/cli/cmd/info.go:16`, `cmd/root.go:398`, `cmd/launch.go:48`, `mcp/client.go:195` | npm `browseros-cli`, bins, help text | Rename if shipped; else exclude from release | No |
| C9 | `chromium_patches/chrome/app/chrome_crash_reporter_client.cc:18-35`, `chrome_crash_reporter_client_win.cc:23` | Crash product names `BrowserOS_*` | Rename with B2 | No |
| C10 | `browseros_constants.h:37` | `chrome://browseros` host in omnibox | `chrome://browser` (route tables + extension pages) | No |
| C11 | `.features.yaml`, ~245 patch files, `chrome.browserOS.*`, `browseros.*` prefs, `--browseros-*` switches | Namespace-level naming | Leave as is: not user-visible, renaming kills rebase cheapness | n/a |

## D. Keep (attribution)

`LICENSE`, `LICENSE.ungoogled_chromium`, `NOTICE`, `CLA.md`, `README.BrowserOS.md`; `Copyright ... BrowserOS` headers on upstream-authored files; `README.browseros` under `third_party/winsparkle`; Sparkle/WinSparkle download URLs. `productRepositoryUrl` / `contributorsUrl` in `productUrls.ts` may point at our public repo (AGPL source offer) but must not be deleted.

## Already clean

macOS Sparkle feed empty by default; hosted LLM provider gated off; classic-app promos gated; MCP server name and managed skill dir `browser`; bundle id / company / BRANDING.release ours; `.env.development` PostHog/Sentry keys empty.

## Deferred (needs user decision or migration)

B14/C8 (CLI: ship or drop), B15 (register own OAuth apps), C1/C6 (coordinated bundle + binary rename after native build verified), C3/C4/C10 (state migrations).

## Status: closed (repo-root lane, 2026-09-13)

| # | Status | What landed |
|---|---|---|
| A13 | done | `README.md` replaced with the product README (what Browser is, status, build/run, privacy, license + attribution linking `README.BrowserOS.md` / `NOTICE` / `LICENSE`); `README.personal.md` folded in and deleted. |
| A14 | done (`skills/`) | `skills/browser/SKILL.md`: manual-MCP and download links repointed to this repo's docs; trigger reworded to "use Browser", with neo/browserclaw/browseros kept only as recognition aliases. The second half of A14, `packages/browseros-agent/resources/skills/browserclaw/SKILL.md`, belongs to the packages lane. |
| B13 | done | `updates/**`: every appcast, extension config and update manifest replaced with an empty-but-valid feed of the same format, plus `updates/README.md` explaining these are placeholders until we have our own feed. `updates/upload.sh` left as is (plumbing only; no upstream URLs of its own). |
