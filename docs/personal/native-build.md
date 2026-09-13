# Native build: source mode, extension keys and ids

What `browseros build --resource-mode source` actually needs, why it needs it,
and where Browser's own signing keys and extension ids live.

## The two resource modes

| Mode | Where the bundled extensions and onboarding come from |
|---|---|
| `published` | Downloaded from the CDN bundled manifest (`https://cdn.browseros.com/extensions/bundled-manifest.xml`, override with `BUNDLED_EXTENSIONS_MANIFEST_URL`). Nothing is built or signed locally. |
| `source` | Built from this working tree and signed with **our** keys, then validated against a strict prepared-resource manifest. |

Source mode is the one that makes a build *ours*: the agent extension is
rebuilt from `packages/browseros-agent/apps/app` and packed into a CRX with our
private key, so the shipped extension id is ours and updates can only come from
a feed we control.

## What each source-mode step does

Composed plan for `--preset release --product browseros --resource-mode source`
(13 steps; `--show-plan` prints it without touching a Chromium checkout):

```
clean, sparkle_setup, prepare_common_resources, prepare_server_resources,
resources, bundled_extensions, chromium_replace, string_replaces,
series_patches, patches, configure, compile, package_macos
```

### `prepare_common_resources` (prep, optional)

`bos_build/steps/resources/source.py`. Produces one platform-independent
directory under
`resources/binaries/prepared_common/<product>/<source_sha>/<version>/`
containing exactly three managed files plus `prepared-resources.json`
(`bos_build/release/prepared_resources.py`):

1. **`product_crx`** — the product's own extension, built and signed locally.
   Which one is product-owned is declared in
   `bos_build/products/resource_sources.py`:
   `browseros` → spec `agent` (`apps/app`), `browserclaw` → spec `browserclaw`
   (`apps/claw-app`). The spec table
   (`bos_build/release/extensions/specs.py`) says how: `bun ci`, then
   `bun run build:agent`, then `chrome --pack-extension=<dist>
   --pack-extension-key=<pem>` (`release/extensions/crx.py`). The id baked into
   the CRX is derived from the PEM's public key and is re-read from the packed
   file (`read_crx_extension_id`) and compared with
   `core/products.py::BROWSEROS_AGENT_EXTENSION_ID` — a key/id mismatch fails
   the build rather than shipping a stranger's id.
2. **`bug_reporter_crx`** — upstream's feedback extension, **downloaded**
   prebuilt from the bundled manifest URL. It is not built and not signed by
   us, so `BUGREPORTER_KEY` is *not* required; only network access is.
3. **`onboarding`** — `bun scripts/build/app-onboard.ts --no-upload`
   (`claw-onboard` for the neo product), validated as a resource archive.

Preflight requires, in order: `resource_mode=source` and a 40-hex source SHA;
`bun` on PATH; the product spec's `signing_key_env` and `required_env` present
and longer than one character; and a usable Chrome/Chromium binary
(`find_chrome_binary`: `--chrome-binary` > `CHROME_BINARY` >
`/Applications/Google Chrome.app`, `/Applications/Chromium.app`, the same under
`~/Applications`, then PATH). The failure this whole document exists for —
`Source common resources require: BROWSEROS_AGENT_V2_KEY` — comes from that
third check.

A prepared directory that already exists is validated, not rebuilt: identity
(product, parent/source SHA, browser version, component versions), the exact
file set, sizes, sha256, and the CRX-embedded extension ids.

### `prepare_server_resources` (prep, optional)

Builds the lane's server binaries from the checkout
(`bos_build/release/server_resources.py`). For `browseros` the bundle is
`browseros-server`, built with **bun**; for `browserclaw` it is
`claw-server-rust`, built with **cargo** and requiring a matching host OS and
`rustup target add <triple>`. No signing keys, no env vars.

### `resources` (prep)

Copies icons and staged resources into the Chromium checkout per
`copy_resources` config. In source mode it first extracts the prepared
onboarding archive into `resources/binaries/browseros_onboarding` so the copy
stage is product-neutral.

### `bundled_extensions` (prep)

Stages CRXs into `chrome/browser/browseros/bundled_extensions/` and writes
`bundled_extensions.json`. In source mode it copies from the prepared
directory; in published mode it downloads from the manifest. Either way the
staged set must equal the product's `required_extension_ids`
(`bos_build/products/browseros/product.py`), and the ids must match the
`*.crx` filenames listed in the
`chromium_patches/.../bundled_extensions/BUILD.gn` patch and the constants in
`chromium_patches/.../core/browseros_constants.h`.

## Keys

Private keys live **outside the repo** and are never committed
(`**/*.pem` is gitignored):

```
~/.config/browser/keys/agent-v2.pem   # classic app, apps/app      (chmod 600)
~/.config/browser/keys/cockpit.pem    # neo cockpit, apps/claw-app (chmod 600)
```

Generated with `openssl genrsa -out <name>.pem 2048`. For each key:

```bash
openssl rsa -in agent-v2.pem -pubout -outform DER | base64        # manifest key:
openssl rsa -in agent-v2.pem -pubout -outform DER | shasum -a 256 # id: first 32 hex, 0-9a-f -> a-p
```

The base64 DER SubjectPublicKeyInfo goes into the `key:` field of the app's
`wxt.config.ts` manifest, which pins the id for unpacked dev loads; the same
PEM signs the CRX, so dev and packed ids agree.

### Current ids

| Extension | Source | id |
|---|---|---|
| Browser app (classic) | `packages/browseros-agent/apps/app` | `lmihdclmhdopaeappmadgmglglcabodf` |
| Cockpit (neo) | `packages/browseros-agent/apps/claw-app` | `jllpmhghjcbaccmpindcmpkddjekbnmm` |
| Bug reporter (upstream) | external, downloaded | `adlpneommgkgeanpaekgoaolcpncohkf` |

Every place an id is hardcoded, so a future rotation has one checklist:

- `packages/browseros-agent/apps/app/wxt.config.ts` (`key:`)
- `packages/browseros-agent/apps/claw-app/wxt.config.ts` (`key:`)
- `packages/browseros-agent/apps/app/lib/personal/neo-extension.ts`
- `packages/browseros/bos_build/core/products.py` (+ several `*_test.py`)
- `packages/browseros/chromium_patches/.../core/browseros_constants.h`
- `packages/browseros/chromium_patches/.../bundled_extensions/BUILD.gn`
- `updates/extensions/{bundled-manifest,update-manifest,update-manifest.alpha}.xml`
  and `updates/extensions/extensions{,.alpha}.json` (tracked feed snapshots;
  ids must be sorted — the render golden tests compare exact output)
- `packages/browseros-agent/scripts/dev/inspect-ui.ts` (dev-loop default)
- the CORS allowlists in `packages/browseros-agent/apps/server` and
  `apps/claw-server-rust` (chrome-extension origins)

## Environment variables

`tools/personal/build-env.example.sh` is the copyable template. Names come from
the spec table, not from a convention we choose:

| Var | Needed by | Notes |
|---|---|---|
| `BROWSEROS_AGENT_V2_KEY` | `--product browseros` source builds | PEM **contents**, not a path |
| `BROWSERCLAW_KEY` | `--product browserclaw` source builds | the cockpit key; there is no `COCKPIT_KEY` — the packer keys by spec |
| `VITE_CLAW_POSTHOG_KEY` | `--product browserclaw` | declared `required_env` on that spec; any value longer than one character satisfies preflight |
| `BROWSEROS_CONTROLLER_KEY` | never, for a browser build | only `browseros release extensions --name controller` |
| `BUGREPORTER_KEY` | never, for a browser build | the bug reporter CRX is downloaded, not signed here |
| `CHROME_BINARY` | optional | overrides CRX-packer Chrome detection |

Values are also read from a `.env` at `packages/browseros/.env` or the repo
root (`bos_build/lib/env.py`); all of these names are in `SENSITIVE_ENV_VARS`,
so they are redacted from build logs.

## External extensions: what can be skipped

- **controller** (`browseros-ai/BrowserOS-agent`, `apps/controller-ext`) is not
  part of any browser build. It is packaged only by the standalone
  `browseros release extensions` command. Nothing to skip.
- **bugreporter** (`browseros-ai/BrowserOS-feedback-extension`) is required, but
  only as a *download*: no external clone, no key, no build. A source build
  therefore needs network access to the bundled manifest host once per prepared
  directory, and then reuses the cached prepared directory.

Dropping upstream's bug reporter from our product entirely is a worthwhile
follow-up (CLAUDE.md: their bug reporter is theirs, not ours) but is a separate
change, not a build blocker. The recipe, for whoever takes it:

1. `bos_build/products/resource_sources.py` already carries an unused
   `external_extension_names` field — set it to `()` for `browseros` and drive
   the rest from it.
2. `release/prepared_resources.py`: make `required_roles` and the
   bug-reporter fetch/validate block conditional on that tuple.
3. `steps/extensions/bundled_extensions.py::_prepared_extensions`: same roles
   list.
4. `products/browseros/product.py`: drop the id from `required_extensions`.
5. `chromium_patches/.../bundled_extensions/BUILD.gn`: drop the
   `adlpneommgkgeanpaekgoaolcpncohkf.crx` source (GN fails on a missing file).
6. Update the ~10 affected `*_test.py` fixtures.

It also changes published-mode behaviour, so land it on its own.

## Running a source build

```bash
source ~/.config/browser/build-env.sh          # copy of tools/personal/build-env.example.sh
cd packages/browseros
uv run browseros build --preset release --product browseros --arch arm64 \
  --provision none --no-sign --no-upload --resource-mode source \
  --chromium-src ~/chromium/src
```

`--show-plan` prints the composed steps and exits without a checkout. Its
"Required env" line lists only env declared on `@step(...)` decorators
(`sparkle_sign`'s `SPARKLE_PRIVATE_KEY`), so it reports `none` here even when
`BROWSEROS_AGENT_V2_KEY` is missing — the key is enforced by
`prepare_common_resources.preflight`, which runs at build time.

Tests: `cd packages/browseros && uv run python -m unittest discover -s bos_build
-t . -p "*_test.py"` (there is no pytest in this environment).

## Iterating on Chromium patches (`--keep-out`)

### The ~10 h reality

A from-scratch `--preset release` build of the official Chromium config on this
M2 Pro / 16 GB machine is an all-day job: build 15's compile ran from ~04:18 to
~20:09 wall clock. That is the price of `clean` doing its two jobs:

1. `git reset --hard` + `git clean -fdx chrome/ components/ third_party/`, so
   the patch series applies to a pristine tree, and
2. `rm -rf out/Default_<product>_<arch>`, which throws away every object file.

Only (1) is needed to re-apply patches. `--keep-out` keeps (1) and drops (2).

### The iterate command

```bash
cd packages/browseros
uv run browseros build --preset release --product browseros --arch arm64 \
  --provision none --no-sign --no-upload --resource-mode published \
  --keep-out --skip sparkle_setup --chromium-src ~/chromium/src
```

`--keep-out` changes nothing about the composed plan (`--show-plan` is
identical); it changes what `clean` deletes:

| | default | `--keep-out` |
|---|---|---|
| `out/Default_<product>_<arch>` (incl. `.ninja_log`, `.siso_deps`, `.siso_fs_state`) | deleted | kept |
| `third_party/sparkle`, `third_party/winsparkle` | deleted | kept |
| `git reset --hard` + `git clean -fdx` of the Chromium tree | yes | yes |
| `out/.browseros_resume` checkpoints | deleted | deleted |

Sparkle survives because it is an unchanging third-party input, which is what
makes `--skip sparkle_setup` (a ~10 MB download on every run otherwise) safe in
this mode. Checkpoints still go: they attest a tree state the reset destroys,
and the run writes fresh ones as it goes.

Everything downstream is incremental-safe: `configure` re-runs `gn gen` in the
existing directory (`--fail-on-unused-args` still applies), `chromium_replace` /
`string_replaces` / `series_patches` / `patches` re-write their files into the
reset tree, and `package_macos` deletes an existing DMG before writing a new
one. **Never use `--keep-out` for a release build** — a shipped artifact should
come out of a from-scratch output directory.

### Why a reset + re-apply does not recompile the world

The build engine here is **siso** (Chromium 151 defaults to it; the output dir
carries `.siso_deps`, `.siso_fs_state`, `.siso_explain`), running locally with
no RBE. Siso uses mtimes only as a first-pass staleness trigger and then
compares content digests, so files that `git reset` rewrote byte-for-identically
do not drag their dependents into a rebuild — no mtime-preserving reset
machinery is needed.

Measured on this machine, from `out/…/siso_explain` of the last incremental run:
1321 edges were re-run, and all but a handful were triggered by one input —
`chrome/VERSION`, which the `compile` step rewrites (`shutil.copy2` of a fresh
temp file) on *every* run. That fan-out is version headers, the mojom/WebUI
generators, the framework relink and `chromedriver`. The matching
`--build --package` run finished in **4 m 2 s** end to end.

Expected rebuild sizes with a kept `out/`:

| change | rebuilt |
|---|---|
| nothing (re-run the same patch set) | ~1.3 k edges, ~4 min (the `chrome/VERSION` fan-out) |
| one patched `.cc`/`.mm` | that TU + relink, ~5 min |
| one patched widely-included header (e.g. `browser.h`) | its fan-out, tens of minutes to ~1 h |
| a patch adding/removing GN targets or files | above plus a full `gn gen`, still far short of 10 h |
| `args.gn`/GN flag change | everything — a full build; drop `--keep-out` |

### Package-only and resume without a full run

The output dir survives, so the compile/package tail can be re-run directly in
phase mode — no planner, no resume checkpoints, no `clean`:

```bash
uv run browseros build --build --package --build-type release --arch arm64 \
  --chromium-src ~/chromium/src           # compile + package_macos
```

This is the workaround of record when a preset run dies after the compile: it is
what produced `chromium-build-15-package.log` (4 m 2 s to a DMG).

`--from <step>` also exists, but its checkpoint validation binds the candidate
contract to the BrowserOS **source identity** — this repo's HEAD plus a digest
of its dirty files — so any commit or edit here (a docs commit included)
invalidates every checkpoint. For that case:

```bash
uv run browseros build --preset release --arch arm64 --no-sign --no-upload \
  --from package_macos --lenient-resume --chromium-src ~/chromium/src
```

`--lenient-resume` drops **only** the `browseros_source` key from the contract
comparison. Product, architecture, build type, platform, resolved plan,
versions, GN configuration and resource pins must still match, and the Chromium
checkout head, the Chromium mutation digest (proving the patched tree is the one
the checkpoint described) and every attested artifact checksum are still
verified. It is rejected without `--from`.

## Bundled Bun runtime (no R2)

The server artifact ships a Bun runtime next to `browseros_server`
(`resources/bin/third_party/bun`). Upstream pulls those five per-platform
binaries from their private R2 bucket, which made
`bun scripts/build/server.ts --target=darwin-arm64 --no-upload` — the command
`prepare_server_resources` runs — fail with
`Missing required env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY`:
`manifestNeedsR2()` in `packages/build-server-tools/src/orchestrator.ts` demands
credentials as soon as any manifest rule is `r2`, even with `--no-upload`.

We fetch the same binaries from the official `oven-sh/bun` GitHub releases
instead:

```
cd packages/browseros-agent
bun scripts/build/fetch-bun-binaries.ts                      # all five platforms
bun scripts/build/fetch-bun-binaries.ts --only darwin-arm64  # one platform
```

- Version comes from `packageManager` (falling back to `engines.bun`) in
  `packages/browseros-agent/package.json`.
- Each zip is verified against the release's `SHASUMS256.txt` when it is
  published; the verified zip hash is stamped beside the binary
  (`bun-darwin-arm64.sha256`) so repeat runs are idempotent and offline.
- Output lands in `packages/browseros-agent/third_party/bun/` (gitignored).
- `scripts/build/server.ts` calls the fetcher automatically for the requested
  `--target`s, so no manual step is needed for a normal build.
- The Chromium build uses the clean worktree at
  `~/chromium/browser-src`; copy or re-run the fetcher there so
  `~/chromium/browser-src/packages/browseros-agent/third_party/bun/` is
  populated too.

`scripts/build/config/server-prod-resources.json` therefore lists the Bun rules
as `{"type": "local", "path": "third_party/bun/<file>"}`. Names, destinations,
`os`/`arch`, and `executable` are unchanged, and `getTargetRules()` filters by
`os`/`arch`, so a `darwin-arm64` build only needs the macOS ARM64 file — the
Linux and Windows binaries may be absent.

JSON has no comments, so the note lives here: the untouched upstream manifest is
kept as `scripts/build/config/server-prod-resources.r2.json`. Pass
`--manifest scripts/build/config/server-prod-resources.r2.json` (with R2
credentials) to build exactly the way upstream CI does.
