# Native Chromium patches — implementation plan

Status: plan only, nothing implemented. Written 2026-09-13.

Scope: nine BrowserOS-fork features implemented as C++/Views patches in
`packages/browseros/chromium_patches`, built with `bos_build` against a local
Chromium checkout at `~/chromium/src`.

## 0. Ground truth

### Chromium version

| Source | Value |
|---|---|
| `packages/browseros/CHROMIUM_VERSION` | `151.0.7922.137` |
| `~/chromium/src/chrome/VERSION` (provisioned checkout) | `151.0.7922.137` |
| `~/chromium/src` HEAD | `8f5d36bc16` *"[M151] Hotfix 4 for back-forward transitions when there is no history"* |
| `packages/browseros/BASE_COMMIT` | `8f5d36bc16f57115aeeff34baf4ad6aa964d509c` |

**There is no 8160.** The repo, the pinned base commit, and the freshly
provisioned checkout all agree on **151.0.7922.137**. If a running binary
reports `151.0.8160.137`, it is either a different (newer) BrowserOS cask than
this tree, or a misread. Everything below is verified against 7922.137 unless
marked otherwise.

The checkout is **pristine upstream Chromium** — `browseros build --provision
shallow` only does `source_checkout`; patches are applied later by the `patches`
step (prep phase). So `~/chromium/src/chrome/browser/browseros/` does not exist
yet. All BrowserOS file:line refs below are into `chromium_patches/`; all
upstream file:line refs are into `~/chromium/src/`.

### Patch-set conventions (verified)

- A patch file lives at **exactly the Chromium path, no `.patch` suffix**:
  `chromium_patches/chrome/browser/ui/tabs/features.cc` is a unified diff of
  `chrome/browser/ui/tabs/features.cc`.
- **Wholly-new Chromium source files are still patches** — a `new file mode`
  diff (e.g. `chromium_patches/chrome/browser/mac/sparkle_glue.mm`, 673 lines).
- `chromium_files/` is **replace-only**: `steps/resources/chromium_replace.py:90`
  raises `FileNotFoundError` if the destination does not already exist upstream.
  It cannot introduce new files. It is used only for the 8 branding overlay
  files under `chromium_files/products/<id>/`.
- Apply order is `sorted()` over the mirrored path tree
  (`patchkit/batch_apply.py:48`); `.features.yaml` is **not** consulted at apply
  time. It is a classification registry, enforced by `browseros dev doctor`
  (`patchkit/doctor.py:148` — an unclassified patch is a hard error).
- Third resource channel: `bos_build/config/copy_resources.yaml` (step
  `resources`) copies files into the checkout and *can* create new paths. That is
  how `resources/browseros/icons/mac/app.icns` lands at
  `chrome/app/theme/chromium/mac/app.icns`.

### The `browseros.*` pref contract (the backbone of this plan)

Declared as `inline constexpr char` in
`chromium_patches/chrome/browser/browseros/core/browseros_prefs.h`
(11 prefs today: `kShowLLMChat`, `kShowAssistant`, `kShowToolbarLabels`,
`kVerticalTabsEnabled`, `kShowTabGroupsInBookmarkBar`, `kProviders`,
`kCustomProviders`, `kDefaultProviderId`, `kNtpFocusContent`,
`kOnboardingCompleted`, `kAutomationNeverStealsFocus`).

Registered in one place: `browseros_prefs.cc:24-46`
(`browseros::RegisterProfilePrefs`), reached from
`chromium_patches/chrome/browser/prefs/browser_prefs.cc:26`.

**Critical:** `BrowserOSSetPrefFunction::Run()`
(`chromium_patches/chrome/browser/extensions/api/browser_os/browser_os_api.cc:117-120`)
allowlists by **prefix only**:

```cpp
if (!params->name.starts_with("browseros.")) {
  return RespondNow(Error("Only browseros.* preferences can be modified"));
}
```

So **every new `browseros.*` pref is automatically readable and writable from
`chrome.browserOS.getPref` / `setPref` the moment it is registered.** No IDL
change, no histogram enum, no allowlist edit. This is why features 2–6 below
need zero extension-API work.

### The mirror pattern (`browseros.X` → upstream `prefs::kY`)

Two helpers per pair, both free functions in `browseros_prefs.cc`:

- `SyncX(PrefService*)` — seeds the upstream pref **only while it
  `IsDefaultValue()`**, so a user who changed the upstream pref keeps their
  choice. Called once at owner construction.
- `ApplyX(PrefService*)` — unconditional write; used as the
  `PrefChangeRegistrar` callback.

Canonical example — `vertical-tabs`, in
`chromium_patches/chrome/browser/ui/tabs/vertical_tab_strip_state_controller.cc`:

```
L17  +#include "chrome/browser/browseros/core/browseros_prefs.h"
L26  +  browseros::SyncVerticalTabsPref(pref_service_);
L34-42 +  pref_change_registrar_.Add(
         browseros::prefs::kVerticalTabsEnabled,
         base::BindRepeating([](PrefService* ps) {
             ps->SetBoolean(prefs::kVerticalTabsEnabled,
                            ps->GetBoolean(browseros::prefs::kVerticalTabsEnabled));
         }, base::Unretained(pref_service_)));
```

Second variant, reusing the upstream `Browser::profile_pref_registrar_` —
`chromium_patches/chrome/browser/ui/browser.cc:40-50`.

### Product gating today, and what we add

`chromium_patches/chrome/browser/browseros/buildflags.gni`:

```
declare_args() { browseros_product = "browseros" }   # or "browserclaw"
browseros_product_browseros  = browseros_product == "browseros"
browseros_product_browserclaw = browseros_product == "browserclaw"
browseros_product_dir_name = "BrowserOS" | "BrowserClaw"
```

`chromium_patches/chrome/browser/browseros/core/browseros_product.h` has a
`static_assert` that **exactly one** product is selected, plus
`IsBrowserOSProduct()` / `IsBrowserClawProduct()` and a runtime
`--browseros-product=` override.

**Decision: do not add a third product.** Adding `Product::kPersonal` breaks the
two-flag `static_assert`, forks `browseros_product_dir_name`, forks
`bundled_extensions/BUILD.gn`, forks the release-feed slugs, and touches ~10
upstream-claimed files for no benefit. Instead add an **orthogonal boolean**:

```gn
# chromium_patches/chrome/browser/browseros/buildflags.gni
declare_args() {
  # Personal single-user build: renames the app to "Browser", disables the
  # updater, and flips personal-build UI defaults. Orthogonal to
  # browseros_product; profile dir and bundle id are unchanged.
  browseros_personal_build = false
}
```

exposed as `BUILDFLAG(BROWSEROS_PERSONAL_BUILD)` via
`chrome/browser/browseros/BUILD.gn`'s existing `buildflag_header("buildflags")`,
and wrapped in a new header:

```cpp
// chrome/browser/browseros/core/browseros_personal.h  (new)
namespace browseros {
inline bool IsPersonalBuild() {
#if BUILDFLAG(BROWSEROS_PERSONAL_BUILD)
  return true;
#else
  return false;
#endif
}
}  // namespace browseros
```

Every feature below is gated by **either** `IsPersonalBuild()` *as the default
value of a `browseros.*` pref* (so upstream behaviour stays reachable by
flipping the pref), **or** by a pure pref with an explicit default. No feature
is gated by `#if` at a call site — that would make the patches unreviewable and
untestable in a stock build.

Enable it with `browseros build ... --gn-arg browseros_personal_build=true`, or
bake it into a local profile (see §11).

---

## 1. `personal-branding`

**Feature name:** `personal-branding`
**Risk:** medium (signing / keychain / profile identity)
**Estimated lines:** ~150, of which ~35 are C++

### What is already done

`packages/browseros/resources/browseros/icons/mac/app.icns` is already
`branding/Browser.icns` (both 879,976 bytes). `copy_resources.yaml` stages it to
`chrome/app/theme/chromium/mac/app.icns`, so **the app icon needs no further
work**. The `product_logo_*.png` family in the same directory should be replaced
from `branding/icon.iconset` / `branding/browser-icon-1024.png` for the About
page, the dock-icon variants, and `IDR_PRODUCT_LOGO_16` (used by the toolbar
Assistant button today and by our Spaces button in §5).

### Product name → "Browser"

The single source of truth is the BRANDING overlay.

`chromium_files/products/browseros/chrome/app/theme/chromium/BRANDING.release`
currently:

```
COMPANY_FULLNAME=BrowserOS
PRODUCT_FULLNAME=BrowserOS
PRODUCT_SHORTNAME=BrowserOS
MAC_BUNDLE_ID=com.browseros.BrowserOS
MAC_TEAM_ID=8YMKWU47S5
```

These values flow into GN as `chrome_product_full_name` /
`chrome_product_short_name` / `chrome_mac_bundle_id`, which are substituted into
`chrome/app/app-Info.plist` → `CFBundleName`, `CFBundleDisplayName`,
`CFBundleIdentifier`. `settings_chromium_strings.grdp` and `chromium_strings.grd`
are rewritten by the `string_replaces` step from
`ProductDescriptor._replacements()` (`bos_build/core/products.py:199`), which
covers the About dialog title and the macOS menu-bar application name
(`IDS_PRODUCT_NAME`).

Because `chromium_files/` is a **per-product** overlay
(`context.py:305-308`: `chromium_files/common`, then
`chromium_files/products/<product.id>`) and we are keeping `product.id ==
"browseros"`, a personal BRANDING cannot be selected by a GN arg. Two options:

**Option A (recommended) — a `personal` product after all, but only in Python.**
`bos_build` products are cheap: one `products/personal/product.py` with a
`ProductDescriptor.define(id="personal", display_name="Browser", ...)` plus
`chromium_files/products/personal/` (4 files). `ProductDescriptor.define`
derives ~40 fields by convention, including `app_base_name="Browser"`,
`bundle_id="com.browseros.Browser"`, `framework_name="Browser
Framework.framework"`. **But** `browseros_product` is a C++ buildflag with a
two-value assert, so `product.py` would still have to emit
`browseros_product = "browseros"`. That requires decoupling `ProductDescriptor.id`
from the GN arg — a `gn_product_id` override field. ~60 lines of Python,
0 lines of C++.

**Option B (simpler, recommended to start) — a personal overlay dir selected by
build type.** `chromium_replace` already honours `.debug` / `.release` suffixes.
Add `chromium_files/products/browseros/chrome/app/theme/chromium/BRANDING.debug`
rewritten to:

```
COMPANY_FULLNAME=Browser
PRODUCT_FULLNAME=Browser
PRODUCT_SHORTNAME=Browser
MAC_BUNDLE_ID=com.jawaid.browser
MAC_TEAM_ID=
```

and always build `--preset debug`. This is zero new machinery, but it conflates
"debug" with "personal" and loses release optimisation. **Take Option B for the
first working build, then migrate to Option A** once the patches are landing.

### Bundle id: `com.jawaid.browser` vs keeping `com.browseros.BrowserOS`

`MAC_BUNDLE_ID` is not just a string. Changing it has four consequences:

| Consequence | Detail | Verdict |
|---|---|---|
| **Keychain "Safe Storage"** | `chromium_patches/components/os_crypt/common/keychain_password_mac.mm` hard-codes service `"BrowserOS Safe Storage"` / account `"BrowserOS"` — this is keyed on the *string constant*, **not** the bundle id. Changing the bundle id alone does **not** re-key it. | Independent; leave alone. |
| **Profile directory** | macOS reads `CrProductDirName` from Info.plist, substituted from `browseros_product_dir_name` in `buildflags.gni` (`chrome/BUILD.gn` patch adds `BROWSEROS_PRODUCT_DIR_NAME=$browseros_product_dir_name`). Profile is `~/Library/Application Support/BrowserOS`. **Also independent of the bundle id.** The buildflags.gni comment: *"Changing a value orphans every existing install's profile."* | Independent; leave alone. |
| **Code signing / Sparkle / TCC** | Camera/mic/screen-recording grants, Keychain ACLs, and the "always allow" state in System Settings are all keyed on bundle id + team id. A new bundle id = re-granting every permission once. | One-time cost. |
| **LaunchServices / default browser** | A new bundle id registers as a distinct app; "set as default browser" must be redone. | One-time cost. |

**Recommendation: keep `com.browseros.BrowserOS`.** The only thing
`com.jawaid.browser` buys is cosmetic distinctness in Activity Monitor. The
visible name (`CFBundleName` / `CFBundleDisplayName` / menu bar / About) comes
from `PRODUCT_FULLNAME`, which we are changing anyway. Keeping the bundle id
means the existing `/Applications/Browser.app` shim, the keychain items, the
profile at `~/Library/Application Support/BrowserOS`, and every TCC grant carry
over untouched. Revisit only if two builds must coexist.

(Note the personal launcher at
`packages/browseros-agent/tools/personal/config.ts:18-23` expects the *inner*
executable to still be named `BrowserOS`. That comes from
`chromium_patches/chrome/common/chrome_constants.cc` (`FPL("browseros")` on
POSIX, capitalised on mac by the app_base_name) — leaving the product id as
`browseros` keeps it working. See §11.)

### Disabling auto-update

The Sparkle feed is **not** `SUFeedURL` in Info.plist. It is returned by
`GetArchitectureSpecificFeedURL()` in
`chromium_patches/chrome/browser/mac/sparkle_glue.mm` (~L30-43):
`https://cdn.browseros.com/appcast.xml`, served via
`-feedURLStringForUpdater:` (~L546), which honours the
`browseros::kSparkleUrl` command-line switch as an override.

Three ways off, in increasing order of permanence:

1. **`--gn-arg enable_sparkle=false`** — `SparkleGlue` is not compiled in at all.
   Both macOS GN flag files currently set `enable_sparkle=true`. This is the
   cleanest and **the recommendation**: zero patch lines.
2. `--disable-updates` at launch — `+sharedSparkleGlue` returns nil
   (`sparkle_glue.mm` ~L337-356). Add it to the launcher's argv.
3. `--browseros-sparkle-url=file:///dev/null` — points the feed nowhere.

Chromium's own updater is already off (`enable_updater = false` in both macOS
flag files). Also strip `SUEnableAutomaticChecks` / `SUAllowsAutomaticUpdates` /
`SUAutomaticallyUpdate` from the `chrome/app/app-Info.plist` patch if you want
belt-and-braces — but with `enable_sparkle=false` those keys are inert.

### Files touched

| File | New? | ~Lines |
|---|---|---|
| `chromium_files/products/browseros/chrome/app/theme/chromium/BRANDING.debug` | edit | 10 |
| `chromium_patches/chrome/browser/browseros/buildflags.gni` | edit | 8 |
| `chromium_patches/chrome/browser/browseros/BUILD.gn` | edit | 2 |
| `chromium_patches/chrome/browser/browseros/core/browseros_personal.h` | **new** | 28 |
| `chromium_patches/chrome/browser/browseros/core/BUILD.gn` | edit | 2 |
| `packages/browseros/resources/browseros/icons/*.png` (+ `mac/app.icns`, done) | resource | — |
| GN: `--gn-arg enable_sparkle=false` | invocation | 0 |

### `.features.yaml` entry

```yaml
  personal-branding:
    description: "feat: personal build identity and gating"
    files:
      - chrome/browser/browseros/core/browseros_personal.h
```

(`buildflags.gni`, `browseros/BUILD.gn` and `core/BUILD.gn` are already claimed by
`browseros-core`; the BRANDING overlay is `chromium_files`, not a patch, so it is
not registered. Doctor only enforces patches.)

---

## 2. `side-panel-left-default`

**Feature name:** `side-panel-left`
**Risk:** low
**Depends on:** `personal-branding` (for `IsPersonalBuild()`)
**Estimated lines:** ~115

### Verified upstream facts

`~/chromium/src/chrome/common/pref_names.h:1205`:

```cpp
// Boolean determining the side the side panel will be appear on (left / right).
// True when the side panel is aligned to the right.
inline constexpr char kSidePanelHorizontalAlignment[] = "side_panel.is_right_aligned";
```

`pref_names.h:1209` — `kSidePanelAlignmentOverrides` = `"side_panel.alignment_overrides"` (dict, per-entry).
`pref_names.h:1216` — `kSidePanelIdToWidth` = `"side_panel.id_to_width"` (dict, entry-id → int).

**There is no `kSidePanelIdealWidth` / `kSidePanelWidth` in 151.** Width is a
per-entry dict, written by `SidePanel::UpdateSidePanelWidthPref()`
(`chrome/browser/ui/views/side_panel/side_panel.cc:550`). The key for our
extension's entry is `SidePanelEntryKey(SidePanelEntryId::kExtension,
kAgentExtensionId).ToString()`.

Registration point: `chromium_patches/chrome/browser/ui/side_panel/side_panel_prefs.cc`,
`side_panel_prefs::RegisterProfilePrefs` — the file is already patched (it
registers the two `browseros.third_party_llm.*` prefs), so this is a
small addition to an already-owned hunk.

Programmatic show, verified at
`chromium_patches/chrome/browser/ui/views/side_panel/extensions/extension_side_panel_utils.cc`
`ToggleContextualExtensionSidePanel`:

```cpp
const SidePanelEntry::Key extension_key(SidePanelEntry::Id::kExtension, extension_id);
SidePanelRegistry* contextual_registry =
    SidePanelRegistry::From(tabs::TabInterface::GetFromContents(&web_contents));
SidePanelUI* side_panel_ui = browser_window.GetFeatures().side_panel_ui();
SidePanelEntry* entry = contextual_registry->GetEntryForKey(extension_key);
contextual_registry->SetActiveEntry(entry);
if (is_active_tab) side_panel_ui->Show(extension_key);
```

### Patch

**New prefs** (`browseros_prefs.h` / `.cc`):

```cpp
// Boolean: side panel docked on the left. Mirrored onto
// prefs::kSidePanelHorizontalAlignment (inverted). Default: personal build.
inline constexpr char kSidePanelLeft[] = "browseros.side_panel_left";
// Integer: default width in DIP for our agent side panel entry on a new
// profile. 0 = leave upstream default. Default: 420 on personal build.
inline constexpr char kSidePanelDefaultWidth[] = "browseros.side_panel_default_width";
// Boolean: open the agent side panel when a new browser window is created.
inline constexpr char kSidePanelOpenOnStartup[] = "browseros.side_panel_open_on_startup";
```

```cpp
registry->RegisterBooleanPref(prefs::kSidePanelLeft, IsPersonalBuild());
registry->RegisterIntegerPref(prefs::kSidePanelDefaultWidth, IsPersonalBuild() ? 420 : 0);
registry->RegisterBooleanPref(prefs::kSidePanelOpenOnStartup, IsPersonalBuild());
```

Plus two helpers, exactly mirroring `SyncVerticalTabsPref` /
`ApplyShowTabGroupsInBookmarkBarPref`:

```cpp
void ApplySidePanelLeftPref(PrefService* prefs) {
  prefs->SetBoolean(::prefs::kSidePanelHorizontalAlignment,
                    !prefs->GetBoolean(prefs::kSidePanelLeft));
}
void SyncSidePanelLeftPref(PrefService* prefs) {   // default-only seeding
  if (prefs->FindPreference(::prefs::kSidePanelHorizontalAlignment)->IsDefaultValue()) {
    ApplySidePanelLeftPref(prefs);
  }
}
void SeedSidePanelWidth(PrefService* prefs, const std::string& entry_key);
```

**Registrar owner:** `Browser::Browser(const CreateParams&)` in
`chromium_patches/chrome/browser/ui/browser.cc`, reusing
`profile_pref_registrar_` exactly as `kShowTabGroupsInBookmarkBar` does today
(browser.cc:40-50). Three added lines:

```cpp
browseros::SyncSidePanelLeftPref(profile_->GetPrefs());
profile_pref_registrar_.Add(
    browseros::prefs::kSidePanelLeft,
    base::BindRepeating(&browseros::ApplySidePanelLeftPref,
                        base::Unretained(profile_->GetPrefs())));
```

**Open on window creation:** the cleanest hook is
`chromium_patches/chrome/browser/ui/views/side_panel/side_panel_helper.cc`
`SidePanelHelper::PopulateGlobalEntries` — already patched for the LLM panel.
But the agent entry is **contextual** (per-tab), not global, and is registered
asynchronously by `ExtensionSidePanelManager` when the extension loads, so a
synchronous call at window init will race.

Use instead a small new per-window coordinator, constructed from
`BrowserWindowFeatures::Init()`
(`chromium_patches/chrome/browser/ui/browser_window/internal/browser_window_features.cc:521`
— the same place `ThirdPartyLlmPanelCoordinator` is created):

- `chrome/browser/ui/views/side_panel/browseros_side_panel_autoopen.{h,cc}` (new,
  ~90 lines). Observes `extensions::ExtensionRegistry` for the agent id and the
  tab's `SidePanelRegistry` for entry registration; on the first tab activation
  where the entry exists and `kSidePanelOpenOnStartup` is true and the user has
  not explicitly closed it this session, calls
  `SetActiveEntry()` + `side_panel_ui->Show(extension_key)`.

Note `chromium_patches/chrome/browser/extensions/api/side_panel/side_panel_api.cc`
already removes the user-gesture requirement from `sidePanel.open()`, so the
**extension could do this itself in JS** (`chrome.sidePanel.open()` from the
service worker on `chrome.windows.onCreated`). **Prefer the JS route first** —
it is zero native lines and lives in `apps/app`. Only build the native
coordinator if the JS version visibly flickers.

### Files touched

| File | New? | ~Lines |
|---|---|---|
| `chrome/browser/browseros/core/browseros_prefs.h` | edit | 18 |
| `chrome/browser/browseros/core/browseros_prefs.cc` | edit | 32 |
| `chrome/browser/ui/browser.cc` | edit | 6 |
| `chrome/browser/ui/side_panel/side_panel_prefs.cc` | edit | 6 |
| `chrome/browser/ui/views/side_panel/browseros_side_panel_autoopen.{h,cc}` | **new** | 90 (optional) |
| `chrome/browser/ui/views/side_panel/BUILD.gn` | edit | 3 |
| `chrome/browser/ui/browser_window/{public,internal}/browser_window_features.{h,cc}` | edit | 12 |

```yaml
  side-panel-left:
    description: "feat: left-docked side panel by default"
    files:
      - chrome/browser/ui/views/side_panel/browseros_side_panel_autoopen.cc
      - chrome/browser/ui/views/side_panel/browseros_side_panel_autoopen.h
```
(the rest are already claimed by `browseros-core` / `llm-chat` / `flags`.)

---

## 3. `side-panel-no-header`

**Feature name:** `side-panel-no-header`
**Risk:** very low — **this is a one-line patch**
**Depends on:** nothing
**Estimated lines:** ~25

### Verified upstream facts

`~/chromium/src/chrome/browser/ui/views/side_panel/side_panel_coordinator.cc:267-273`:

```cpp
if (entry->should_show_header()) {
  side_panel->AddHeaderView(std::make_unique<SidePanelHeader>(
      std::make_unique<SidePanelHeaderController>(
          &*browser_, side_panel_toolbar_pinning_controller_.get(), entry)));
} else {
  side_panel->RemoveHeaderView();
}
```

`~/chromium/src/chrome/browser/ui/side_panel/side_panel_entry.h:113-116` already
has the exact escape hatch:

```cpp
void set_should_show_header(bool should_show_header) { should_show_header_ = should_show_header; }
bool should_show_header() const { return should_show_header_; }
bool should_show_header_ = true;   // L166
```

The header is a **separate view painted over the border**
(`side_panel.h:75-76`), not part of the content layout, and `SidePanel::Layout`
skips it explicitly (`side_panel.cc:668`). The resize handle is
`SidePanelResizeArea`, a sibling view (`side_panel.cc:459` inserts the header
after `resize_area_` in the focus list) — **removing the header does not touch
the resize handle.** Confirmed.

### Patch

One condition at `side_panel_coordinator.cc:267`:

```cpp
if (entry->should_show_header() &&
    !browseros::ShouldHideSidePanelHeader(entry->key(), browser_->GetProfile()->GetPrefs())) {
```

with, in `browseros_prefs.{h,cc}`:

```cpp
// Boolean: hide the side panel header (title, pin, new-tab, more, close) when
// the shown entry is a BrowserOS extension panel. Default: personal build.
inline constexpr char kHideSidePanelHeader[] = "browseros.hide_side_panel_header";

bool ShouldHideSidePanelHeader(const SidePanelEntryKey& key, PrefService* prefs) {
  return prefs->GetBoolean(prefs::kHideSidePanelHeader) &&
         key.id() == SidePanelEntryId::kExtension &&
         key.extension_id().has_value() &&
         IsActiveBrowserOSExtension(*key.extension_id());
}
```

`IsActiveBrowserOSExtension` already exists at `browseros_constants.h:115`.

`side_panel_coordinator.cc` is already claimed by `side-panel-fixes`, so this
adds a hunk to an existing patch. **Watch out:** without a header there is no
close button — the user must be able to close via the toolbar Spaces button
(§5) or the accelerator. Ship §5 alongside, or leave the pref default off until
§5 lands.

### Files touched

| File | ~Lines |
|---|---|
| `chrome/browser/ui/views/side_panel/side_panel_coordinator.cc` | 5 |
| `chrome/browser/browseros/core/browseros_prefs.h` | 6 |
| `chrome/browser/browseros/core/browseros_prefs.cc` | 14 |

```yaml
  side-panel-no-header:
    description: "feat: headerless side panel for browseros extension entries"
    files: []   # all touched files already claimed; add the hunk to side-panel-fixes
```
Simplest: **add no new feature entry**; fold the hunk into the existing
`side-panel-fixes` feature, which already claims `side_panel_coordinator.cc`.

---

## 4. `hide-tab-strip`

**Feature name:** `hide-tab-strip`
**Risk:** medium (fullscreen/immersive interactions; tab drag-out)
**Depends on:** `personal-branding`
**Estimated lines:** ~55

### Verified upstream facts

`~/chromium/src/chrome/browser/ui/views/frame/browser_view.cc:1380`:

```cpp
bool BrowserView::ShouldDrawTabStrip() const {
  if (!browser_->SupportsWindowFeature(Browser::WindowFeature::kFeatureTabStrip)) {
    return false;
  }
  return horizontal_tab_strip_region_view_->tab_strip() != nullptr;
}
```

`:1395`:

```cpp
bool BrowserView::ShouldDrawVerticalTabStrip() const {
  auto* controller = tabs::VerticalTabStripStateController::From(browser_);
  return ShouldDrawTabStrip() && controller &&
         controller->ShouldDisplayVerticalTabs() && browser_->is_type_normal();
}
```

`:1319` `GetTabStripVisible()` calls `ShouldDrawTabStrip()` first.

**`ShouldDrawTabStrip()` is the single choke point for both orientations.**
Gating it kills the horizontal strip *and* the vertical strip, and all 9
`SupportsWindowFeature(kFeatureTabStrip)` call sites in `browser_view.cc`
funnel through it or through `GetSupportsTabStrip()`.

Do **not** override `Browser::SupportsWindowFeature` /
`WindowFeatureController::NormalBrowserSupportsWindowFeature`
(`chrome/browser/ui/window_feature_controller/window_feature_controller.cc:77`):
that flag also controls tab dragging, session restore shape, tab-strip model
assumptions, and `chrome.tabs` behaviour. Gating at the **view** layer is the
rebase-friendly, low-blast-radius choice.

### Patch

```cpp
// browser_view.cc
bool BrowserView::ShouldDrawTabStrip() const {
  if (browseros::ShouldHideTabStrip(browser_->profile()->GetPrefs())) {
    return false;
  }
  if (!browser_->SupportsWindowFeature(Browser::WindowFeature::kFeatureTabStrip)) {
  ...
```

plus a `PrefChangeRegistrar` on `browseros.hide_tab_strip` (owned by
`BrowserView`, or reuse `Browser::profile_pref_registrar_` and call
`browser_view->InvalidateLayout()` / `ToolbarSizeChanged()`) so the toggle is
live rather than needing a restart.

```cpp
// Boolean: do not draw either tab strip (horizontal or vertical). Tab
// switching is expected to happen from the sidebar. Default: personal build.
inline constexpr char kHideTabStrip[] = "browseros.hide_tab_strip";
registry->RegisterBooleanPref(prefs::kHideTabStrip, IsPersonalBuild());
```

`browser_view.cc` is **not currently patched by any feature** — this creates the
first BrowserOS hunk in it. Keep it to exactly these ~8 lines; everything else
(compact mode §6) should live in new files.

### Tab search access

Tab search lives in `TabStripActionContainer`, inside the strip — hiding the
strip hides it. Three options, in order of preference:

1. **Sidebar** (`apps/app`, zero native lines) — the sidebar spec
   (`docs/personal/sidebar-spec.md`) already plans a tab tree; `chrome.tabs` +
   `chrome.tabGroups` give everything tab search does.
2. Keep the ⇧⌘A accelerator bound to `IDC_TAB_SEARCH` and let it open the
   bubble anchored to the toolbar — needs an anchor-view fallback in
   `TabSearchBubbleHost` when the strip is hidden (~30 extra lines). Verify
   against the checkout whether the current anchor is nullable.
3. Do nothing; rely on ⌘1–9 / ⌃Tab.

**Take option 1.** Note this in the plan and skip native tab-search work.

### Files touched

| File | ~Lines |
|---|---|
| `chrome/browser/ui/views/frame/browser_view.cc` | 14 |
| `chrome/browser/ui/views/frame/browser_view.h` | 4 |
| `chrome/browser/browseros/core/browseros_prefs.{h,cc}` | 12 |

```yaml
  hide-tab-strip:
    description: "feat: hide tab strip in personal build"
    files:
      - chrome/browser/ui/views/frame/browser_view.cc
      - chrome/browser/ui/views/frame/browser_view.h
```

---

## 5. `toolbar-personal`

**Feature name:** `toolbar-personal`
**Risk:** low
**Depends on:** `personal-branding`
**Estimated lines:** ~145

### Removing the Assistant (dog) and Chat buttons

Already fully parameterised — no new machinery.
`chromium_patches/chrome/browser/browseros/core/browseros_prefs.cc:115-131`:

```cpp
const char* GetVisibilityPrefForAction(actions::ActionId id) {
  switch (id) {
    case kActionSidePanelShowThirdPartyLlm: return prefs::kShowLLMChat;
    case kActionBrowserOSAgent:             return prefs::kShowAssistant;
    default: return nullptr;
  }
}
bool ShouldShowToolbarAction(actions::ActionId id, PrefService* prefs) { ... }
```

consumed by `PinnedToolbarActionsModel::EnsureAlwaysPinnedActions()`
(`chromium_patches/chrome/browser/ui/toolbar/pinned_toolbar/pinned_toolbar_actions_model.cc`),
which reactively unpins on pref change
(`OnBrowserOSVisibilityPrefChanged`, registered at `.cc:42-56`).

So the whole "remove the dog and Chat" patch is **two default flips** in
`browseros_prefs.cc:27-32`:

```cpp
const bool show_toolbar_controls_by_default =
    !IsBrowserClawProduct() && !IsPersonalBuild();
registry->RegisterBooleanPref(prefs::kShowLLMChat,  show_toolbar_controls_by_default);
registry->RegisterBooleanPref(prefs::kShowAssistant, show_toolbar_controls_by_default);
```

Upstream behaviour stays reachable: `chrome.browserOS.setPref('browseros.show_assistant', true)`.

Keep `features::kThirdPartyLlmPanel` enabled — unpinning is enough; disabling the
feature would also drop the ⇧⌘K accelerator and the `kThirdPartyLlm` side panel
entry registration, which is more churn than needed.

The extension puzzle menu is `ExtensionsToolbarContainer`, untouched by any of
this. Confirmed: no patch in the set touches it.

### Adding the "Spaces" action

Follow the `kActionBrowserOSAgent` template exactly
(`chromium_patches/chrome/browser/ui/browser_actions.cc:418-500`):

1. **Action id** — `chromium_patches/chrome/browser/ui/actions/chrome_action_id.h`,
   append `E(kActionBrowserOSSpaces)` to the same macro list that already has
   `E(kActionBrowserOSAgent)` (line ~578).
2. **Command id** — `chromium_patches/chrome/app/chrome_command_ids.h`:
   `#define IDC_TOGGLE_BROWSEROS_SPACES 40309` (40306–40308 taken).
3. **ActionItem** — `browser_actions.cc`, inside
   `BrowserActions::InitializeSidePanelActions()`, guarded by
   `browseros::IsActiveBrowserOSExtension(browseros::kAgentExtensionId)`.
   Body is a copy of the Assistant callback: resolve the active tab, get the
   `extensions::SidePanelService`, call `BrowserosToggleSidePanelForTab(...)`.
   Set `.SetText(u"Spaces")` and `.SetTooltipText(u"Spaces")`.
4. **Visibility pref** — add `kShowSpaces = "browseros.show_spaces"`
   (default `IsPersonalBuild()`), and a `case kActionBrowserOSSpaces: return
   prefs::kShowSpaces;` in `GetVisibilityPrefForAction`.
5. **Pinning** — add `kActionBrowserOSSpaces` handling in
   `EnsureAlwaysPinnedActions()` next to the existing agent block, and add it to
   `browseros::kBrowserOSNativeActionIds` in `browseros_action_utils.h` so
   `IsBrowserOSAction()` returns true (which drives label rendering and
   `PinnedToolbarActionFlexPriority::kHigh` at
   `pinned_toolbar_actions_container.cc:889`).
6. **Accelerator** (optional) — mirror
   `chromium_patches/chrome/browser/ui/accelerator_table.cc` and
   `global_keyboard_shortcuts_mac.mm`, both already gated on
   `features::kBrowserOsKeyboardShortcuts`.

### The icon

Two routes.

**Route A (recommended, 0 extra lines): reuse the product logo bitmap.** The
existing Assistant action uses
`.SetImage(ui::ImageModel::FromResourceId(IDR_PRODUCT_LOGO_16))`
(`browser_actions.cc:490`). `IDR_PRODUCT_LOGO_16` resolves to
`chrome/app/theme/chromium/product_logo_16.png`, which `copy_resources.yaml`
stages from `resources/browseros/icons/product_logo_16.png` — i.e. **from our
branding assets**. Replace those PNGs (16/32 at 100% and 200%) with the Browser
logo and the Spaces button gets our mark for free. Downside: bitmaps do not
recolour with the theme and do not scale to arbitrary DIP.

**Route B: a real `.icon` file.** Per
`~/chromium/src/components/vector_icons/README.md`:

> Chrome uses `.icon` files to describe vector icons. This is a bespoke file
> format which is actually a C++ array definition.

Pipeline:

1. Minify the SVG through SVGO ([SVGOMG](https://jakearchibald.github.io/svgomg/)).
   Delete any full-bleed background rect (`<path d="M0 0h16v16H0z"/>`) — the
   README notes it inverts colours.
2. Run it through **Skiafy** (<http://evanstade.github.io/skiafy/>). For Google
   Material SVGs with `viewBox="0 -960 960 960"`, enter `960` as the y offset.
3. Paste the output into `components/vector_icons/<name>.icon`, prefixed with
   the Chromium BSD header and `CANVAS_DIMENSIONS, <n>,`. The existing
   `chromium_patches/components/vector_icons/chat_orange.icon` (48 lines,
   `CANVAS_DIMENSIONS, 960`) is the worked example in this tree.
4. Add the filename to the `sources` list in
   `chromium_patches/components/vector_icons/BUILD.gn` (the patch already has a
   hunk adding `"chat_orange.icon",` — add ours next to it).
5. Reference it as `vector_icons::kSpacesIcon` — `foo_bar.icon` →
   `kFooBarIcon`, auto-generated by `aggregate_vector_icons.py`.
6. `.SetImage(ui::ImageModel::FromVectorIcon(vector_icons::kSpacesIcon, kColorToolbarButtonIcon))`.

Both `components/vector_icons/BUILD.gn` and the `.icon` file are already claimed
by the `branding` feature — extend it rather than creating a new one.

**Start with Route A**, switch to B once the mark is final.

### Files touched

| File | New? | ~Lines |
|---|---|---|
| `chrome/browser/ui/browser_actions.cc` | edit | 55 |
| `chrome/browser/ui/actions/chrome_action_id.h` | edit | 2 |
| `chrome/app/chrome_command_ids.h` | edit | 2 |
| `chrome/browser/browseros/core/browseros_prefs.{h,cc}` | edit | 16 |
| `chrome/browser/browseros/core/browseros_action_utils.h` | edit | 4 |
| `chrome/browser/ui/toolbar/pinned_toolbar/pinned_toolbar_actions_model.cc` | edit | 14 |
| `components/vector_icons/spaces.icon` (route B) | **new** | 40 |
| `components/vector_icons/BUILD.gn` (route B) | edit | 1 |

```yaml
  toolbar-personal:
    description: "feat: personal toolbar layout and spaces action"
    files: []   # all edits land in files already claimed by browseros-core,
                # pin-chat, branding; add hunks there
```
Every file is already claimed. **No new feature entry needed** — but add a
comment in `.features.yaml` next to `browseros-core` noting the Spaces action.
If you want an isolated entry for rebase bisecting, the only unclaimed candidate
is `components/vector_icons/spaces.icon`.

---

## 6. `compact-mode`

**Feature name:** `compact-mode`
**Risk:** **high** — the largest and least upstream-supported feature here
**Depends on:** `side-panel-left` (needs the panel on the left), `hide-tab-strip`
**Estimated lines:** ~420

### Behaviour

When `browseros.compact_mode` is true: the side panel is not laid out at all
(content area is full width); a 4 px hit strip along the window's left content
edge, on hover, slides the panel in as an **overlay on top of** the content
(z-order above `contents_container_`, not a layout participant); it stays while
the cursor is inside the panel or the strip, and retracts 150 ms after the
cursor leaves.

### The hard part

`SidePanel` is a child of `BrowserView` positioned by `BrowserViewLayout` /
`browser_view_tabbed_layout_impl.cc`. Making it an overlay means it must be
excluded from that layout and repositioned manually, which is exactly the kind
of change that conflicts on every Chromium rebase.

**Do not modify `BrowserViewLayout`.** Instead:

1. Keep `side_panel_` in the view hierarchy but set
   `side_panel_->SetProperty(views::kViewIgnoredByLayoutKey, true)` while compact
   is on. Verify this key is honoured by the layout impl — **needs confirmation
   in the checkout** (`chrome/browser/ui/views/frame/layout/browser_view_tabbed_layout_impl.cc`;
   the only existing BrowserOS hunk there is a one-constant change,
   `kVerticalTabsGrabHandleSize 40 → 5`).
2. If it is not honoured, the fallback is `side_panel_->SetVisible(false)` plus a
   **separate overlay widget** — a `views::Widget` child of the browser widget
   hosting a second `SidePanel`-like `views::View`. More lines (~150 extra) but
   zero layout coupling. Reuse `SidePanelWebUIView` / the extension's
   `WebView` by reparenting it on reveal.
3. Position/size on reveal via `SetBoundsRect()` and a
   `gfx::SlideAnimation` (or `views::AnimationBuilder`).

### Mouse tracking

`~/chromium/src/ui/views/mouse_watcher.{h,cc}` + `mouse_watcher_view_host.h`
exist and are the right tool: `views::MouseWatcher` with a
`MouseWatcherViewHost(view, insets)` fires `MouseMovedOutOfHost()` after the
cursor leaves a view's bounds plus a margin, and takes a
`notify_on_exit_time` delay — that is the 150 ms linger, for free.

For the **entry** edge (cursor arriving at the 4 px strip when nothing is shown),
`MouseWatcher` does not help: it only watches exits. Use a real, zero-width-ish
child view:

- `BrowserOSCompactHitStrip : public views::View` — 4 px wide, full content
  height, at the left edge of `contents_container_`, `SetVisible(true)` but
  painting nothing. Override `OnMouseEntered()` → reveal.
- It must be **above** the web contents in z-order to receive events, and must
  not swallow clicks: override `GetCanProcessEventsWithinSubtree()` / return
  `false` from hit-testing for anything but `ET_MOUSE_MOVED`/`ET_MOUSE_ENTERED`,
  or use `views::View::SetNotifyEnterExitOnChild`.
- **Known hazard:** a `views::View` sibling of a `WebView` does not reliably get
  mouse-move events when the cursor is over the (native, layer-backed) web
  contents. This is precisely the problem that forces a native tracker in
  other browsers. If the strip view proves unreliable, fall back to a
  `ui::EventMonitor::CreateWindowMonitor(this, browser_widget->GetNativeWindow(),
  {ui::EventType::kMouseMoved})` on the browser widget, which sees events before
  they are routed into the web contents. Budget for this: it is the single most
  likely thing to need a second attempt.

### Classes

| File | New? | ~Lines |
|---|---|---|
| `chrome/browser/ui/views/frame/browseros_compact_mode_controller.{h,cc}` | **new** | 260 |
| `chrome/browser/ui/views/frame/browseros_compact_hit_strip.{h,cc}` | **new** | 90 |
| `chrome/browser/ui/views/frame/browser_view.{h,cc}` | edit | 30 |
| `chrome/browser/ui/views/frame/BUILD.gn` | edit | 4 |
| `chrome/browser/browseros/core/browseros_prefs.{h,cc}` | edit | 12 |
| `chrome/app/chrome_command_ids.h` + accelerator tables | edit | 12 |
| `chrome/browser/ui/browser_command_controller.cc` | edit | 8 |

Owner: construct the controller from `BrowserWindowFeatures::Init()`
(`browser_window_features.cc:521`), passing the `BrowserView`.

### Accelerator

⌘S is `IDC_SAVE_PAGE` — a genuine conflict, and save-page is worth keeping.
**Use ⌥⌘S** (`ui::VKEY_S, ui::EF_ALT_DOWN | ui::EF_PLATFORM_ACCELERATOR`).
Verified free: no entry for VKEY_S with ALT in
`~/chromium/src/chrome/browser/ui/accelerator_table.cc`. Add to both
`chromium_patches/chrome/browser/ui/accelerator_table.cc` and
`chromium_patches/chrome/browser/global_keyboard_shortcuts_mac.mm`
(`{true, false, true, false, kVK_ANSI_S, IDC_TOGGLE_BROWSEROS_COMPACT}` — the
tuple is `{command, shift, option/alt, control, keycode, command_id}` per the
existing entries), inside the existing
`features::kBrowserOsKeyboardShortcuts` guard.

```cpp
// Boolean: compact mode — side panel hidden, revealed on left-edge hover.
inline constexpr char kCompactMode[] = "browseros.compact_mode";
registry->RegisterBooleanPref(prefs::kCompactMode, false);  // opt-in, not on by default
```

Default **false** even in the personal build: this is the riskiest feature and
should be user-triggered until proven.

```yaml
  compact-mode:
    description: "feat: compact mode with hover-revealed side panel"
    files:
      - chrome/browser/ui/views/frame/browseros_compact_mode_controller.cc
      - chrome/browser/ui/views/frame/browseros_compact_mode_controller.h
      - chrome/browser/ui/views/frame/browseros_compact_hit_strip.cc
      - chrome/browser/ui/views/frame/browseros_compact_hit_strip.h
```

---

## 7. `glance`

**Feature name:** `glance`
**Risk:** medium-high (WebContents lifetime, focus, Escape handling)
**Depends on:** `personal-branding`
**Estimated lines:** ~380

### Behaviour

`chrome.browserOS.openGlance(url)` opens a floating overlay WebContents centred
over the content area of the last-active window. Escape or a click outside
closes it. A button promotes it to a real tab.

### Views approach

`~/chromium/src/chrome/browser/ui/views/bubble/webui_bubble_manager.{h,cc}` and
`webui_bubble_dialog_view.{h,cc}` exist, but **`WebUIBubbleManager` is
WebUI-only** — it is templated on a `WebUIController` subclass and owns a
`BubbleContentsWrapperT`. It cannot host an arbitrary http(s) URL.

Use instead a plain `views::BubbleDialogDelegateView` hosting a `views::WebView`:

- `chrome/browser/ui/views/browseros/glance_bubble_view.{h,cc}` (new).
  - `class GlanceBubbleView : public views::BubbleDialogDelegateView,
                              public content::WebContentsDelegate,
                              public content::WebContentsObserver`
  - ctor: create `content::WebContents` from
    `content::WebContents::CreateParams(profile)`, own it, set `this` as
    delegate, `AddChildView(std::make_unique<views::WebView>(profile))` and
    `web_view->SetWebContents(owned_contents_.get())`.
  - `SetAnchorView(browser_view->contents_container())`,
    `SetArrow(views::BubbleBorder::Arrow::FLOAT)`,
    `set_close_on_deactivate(true)` → click-outside closes.
  - `SetButtons(ui::mojom::DialogButton::kNone)`; add a small header row with an
    "Open in tab" `views::MdTextButton` whose callback does
    `browser->OpenURL(...)` / `chrome::AddTabAt` with the current
    `web_contents()->GetLastCommittedURL()` and then `CloseBubble()`.
  - Escape: `BubbleDialogDelegate` handles VKEY_ESCAPE via `Cancel()` by
    default — verify it is not swallowed by the WebView first; if it is,
    override `AcceleratorPressed` and register
    `ui::Accelerator(ui::VKEY_ESCAPE, ui::EF_NONE)` on the bubble widget.
  - `WebContentsDelegate::AddNewContents` → route target=_blank to a real tab.
- `chrome/browser/ui/views/browseros/glance_controller.{h,cc}` (new) — per-window
  owner, constructed in `BrowserWindowFeatures::Init()`; holds a
  `views::Widget*`, `Show(GURL)` / `Close()` / `IsShowing()`.

Size it at `min(0.7 * contents_bounds, 1000x700)`, centred.

### Extension API addition

Full recipe, verified against how `showInfoBar` was added:

1. **`chromium_patches/chrome/common/extensions/api/browser_os.idl`** — add
   `callback OpenGlanceCallback = void(boolean opened);` near L72 and, inside
   `interface Functions`:
   ```
   static void openGlance(DOMString url, optional OpenGlanceCallback callback);
   ```
2. **`chrome/browser/extensions/api/browser_os/browser_os_api.h`** —
   ```cpp
   class BrowserOSOpenGlanceFunction : public ExtensionFunction {
     DECLARE_EXTENSION_FUNCTION("browserOS.openGlance", BROWSER_OS_OPENGLANCE)
     ResponseAction Run() override;
   };
   ```
3. **`chrome/browser/extensions/api/browser_os/browser_os_api.cc`** — `Run()`.
   Resolve the window exactly as `showInfoBar` does (`browser_os_api.cc:318-325`):
   ```cpp
   Profile* profile = Profile::FromBrowserContext(browser_context());
   auto* collection = ProfileBrowserCollection::GetForProfile(profile);
   BrowserWindowInterface* browser = collection ? collection->GetLastActiveBrowser() : nullptr;
   browser->GetFeatures().glance_controller()->Show(GURL(params->url));
   ```
   Validate the URL scheme (http/https only) and reject otherwise.
4. **`extensions/browser/extension_function_histogram_value.h`** — BrowserOS owns
   1978–2004; `BROWSER_OS_SHOWINFOBAR = 2004` is the highest live value, so
   **`BROWSER_OS_OPENGLANCE = 2005`**.
5. **`tools/metrics/histograms/metadata/extensions/enums.xml`** —
   `<int value="2005" label="BROWSER_OS_OPENGLANCE"/>`.
6. `_api_features.json` / `_permission_features.json` — **no change**;
   `"browserOS"` is already a whole-namespace permission with no id allowlist.

**Caveat (important):** every `browserOS` function resolves
`GetLastActiveBrowser()`, not the caller's window. If Glance must open in a
specific window, add a `windowId` parameter and resolve via
`ExtensionTabUtil::GetTabById(...)` → `window->GetBrowserWindowInterface()`, the
pattern used by `SidePanelService::BrowserosToggleSidePanelForTab`
(`chromium_patches/chrome/browser/extensions/api/side_panel/side_panel_service.cc:38-47`).

### Files touched

| File | New? | ~Lines |
|---|---|---|
| `chrome/browser/ui/views/browseros/glance_bubble_view.{h,cc}` | **new** | 230 |
| `chrome/browser/ui/views/browseros/glance_controller.{h,cc}` | **new** | 90 |
| `chrome/browser/ui/views/browseros/BUILD.gn` | **new** | 25 |
| `chrome/browser/ui/BUILD.gn` | edit | 3 |
| `chrome/browser/ui/browser_window/{public,internal}/browser_window_features.{h,cc}` | edit | 12 |
| `chrome/common/extensions/api/browser_os.idl` | edit | 8 |
| `chrome/browser/extensions/api/browser_os/browser_os_api.{h,cc}` | edit | 45 |
| `extensions/browser/extension_function_histogram_value.h` | edit | 1 |
| `tools/metrics/histograms/metadata/extensions/enums.xml` | edit | 1 |

```yaml
  glance:
    description: "feat: glance floating overlay"
    files:
      - chrome/browser/ui/views/browseros/
```
(directory claim — doctor accepts a trailing slash and requires ≥1 patch inside.)

---

## 8. `window-tint`

**Feature name:** `window-tint`
**Risk:** low — **almost entirely upstream API**
**Depends on:** `personal-branding`, `glance` (shares the API-addition recipe)
**Estimated lines:** ~120

### The key finding

In Chromium 151 `BrowserFrame` has been renamed **`BrowserWidget`**
(`~/chromium/src/chrome/browser/ui/views/frame/browser_widget.{h,cc}`). Its
`GetColorProviderKey()` (`browser_widget.cc:444-461`) already re-applies
per-widget overrides *after* the ThemeService key:

```cpp
ui::ColorProviderKey BrowserWidget::GetColorProviderKey() const {
  auto key = Widget::GetColorProviderKey();
  key = theme_service->GetColorProviderKey(key, profile);
  if (color_mode_override().has_value())  key.color_mode = color_mode_override().value();
  if (user_color_override().has_value()) {
    key.user_color = user_color_override().value();
    key.user_color_source = ui::ColorProviderKey::UserColorSource::kAccent;
  }
  ...
```

and `~/chromium/src/ui/views/widget/widget.h:1434,1442` exposes:

```cpp
void SetColorModeOverride(std::optional<ui::ColorProviderKey::ColorMode>);
void SetUserColorOverride(std::optional<SkColor>);
```

**So a per-window tint requires zero Views patches.** The whole implementation is:

```cpp
browser_view->GetWidget()->SetUserColorOverride(SkColorSetRGB(r, g, b));
// optionally also SetColorModeOverride(kDark) when the tint is dark
```

Chromium regenerates the window's `ColorProvider`, which recolours
`kColorToolbar`, `kColorFrameActive`, tab strip, omnibox, and bubbles
consistently — far better than painting a translucent rect over the toolbar,
which would break text contrast and icon colours.

### The `a` (alpha) parameter

`user_color` is opaque; alpha is meaningless to the color pipeline. Interpret
`a` as **tint strength** and pre-blend against the current theme colour before
calling `SetUserColorOverride`:

```cpp
SkColor base = browser_view->GetColorProvider()->GetColor(kColorToolbar);
SkColor tinted = color_utils::AlphaBlend(requested_rgb, base, alpha_fraction);
```

If a literal translucent *overlay* is genuinely wanted later, that is a
`views::Background` on `ToolbarView` + a frame-view paint override — a much
larger and more fragile patch. Do not start there.

### Persistence

Per-window and non-persistent by design. If it should survive restart, store a
`browseros.window_tint` string pref (hex) and re-apply in
`BrowserWindowFeatures::Init()`.

### Extension API

`chrome.browserOS.setWindowTint({r, g, b, a})` — same 6-step recipe as §7, with
`BROWSER_OS_SETWINDOWTINT = 2006`. Add a `WindowTint` dictionary to the IDL:

```
dictionary WindowTint { long r; long g; long b; double a; };
callback SetWindowTintCallback = void(boolean applied);
static void setWindowTint(WindowTint tint, optional SetWindowTintCallback callback);
```

Add an optional `windowId` (see the caveat in §7) since "per window" is the
whole point — without it the API can only tint the last-active window.

### Files touched

| File | New? | ~Lines |
|---|---|---|
| `chrome/browser/ui/views/browseros/window_tint_controller.{h,cc}` | **new** | 70 |
| `chrome/browser/ui/browser_window/{public,internal}/browser_window_features.{h,cc}` | edit | 12 |
| `chrome/common/extensions/api/browser_os.idl` | edit | 12 |
| `chrome/browser/extensions/api/browser_os/browser_os_api.{h,cc}` | edit | 40 |
| `extensions/browser/extension_function_histogram_value.h` + enums.xml | edit | 2 |
| `chrome/browser/browseros/core/browseros_prefs.{h,cc}` (optional persistence) | edit | 8 |

```yaml
  window-tint:
    description: "feat: per-window color tint api"
    files:
      - chrome/browser/ui/views/browseros/window_tint_controller.cc
      - chrome/browser/ui/views/browseros/window_tint_controller.h
```
(Note this overlaps the `glance` directory claim — either put both under one
`browseros-views` feature, or list files individually in both. Doctor emits a
`multi-claim` **warning**, not an error, but prefer individual file lists here.)

---

## 9. `spaces-menu` (deferred)

**Feature name:** `spaces-menu`
**Risk:** medium
**Status: later. Do not build in the first pass.**
**Estimated lines:** ~260

`~/chromium/src/chrome/browser/ui/cocoa/main_menu_builder.{h,mm}` exists and is
the right file. The work is:

1. A new top-level `NSMenu` between "Window" and "Help".
2. Nine placeholder items with ⌃1–⌃9, bound to new command ids
   `IDC_BROWSEROS_SPACE_1..9` (40310–40318).
3. A `chrome.browserOS.setSpacesMenu([{id, title, index}])` function
   (`BROWSER_OS_SETSPACESMENU = 2007`) writing to a `browseros.spaces_menu`
   **list pref**, plus a `PrefChangeRegistrar` in the `AppController` that
   rebuilds the NSMenu titles.
4. Command handling in `browser_command_controller.cc` that forwards the index
   to the extension (there is no native concept of a space — the extension owns
   the model, so the native side is a dumb view + a dumb event source).

Why defer: the whole value is a keyboard shortcut and a menu listing, and
`chrome.commands` in `apps/app` already provides ⌥⇧→ / ⌥⇧← / ⌥⇧S plus nine
unbound `space-1..9` commands (per `CLAUDE.md`, 2026-09-12 status log). Binding
those in `chrome://extensions/shortcuts` gets 90% of this for zero native lines.
Revisit only if the menu-bar listing itself is wanted.

---

## 10. Order, dependencies, totals

```
personal-branding ──┬──> side-panel-left ──> compact-mode
                    ├──> side-panel-no-header
                    ├──> hide-tab-strip  ──> compact-mode
                    ├──> toolbar-personal ──> (unblocks side-panel-no-header shipping)
                    ├──> glance ──────────┐
                    └──> window-tint <────┘ (shares the API-addition recipe)
                                            spaces-menu (later)
```

| # | Feature | Order | ~Lines | Risk |
|---|---|---|---|---|
| 1 | `personal-branding` | 1 | 150 | medium |
| 3 | `side-panel-no-header` | 2 | 25 | very low |
| 5 | `toolbar-personal` | 3 | 145 | low |
| 2 | `side-panel-left` | 4 | 115 | low |
| 4 | `hide-tab-strip` | 5 | 55 | medium |
| 8 | `window-tint` | 6 | 120 | low |
| 7 | `glance` | 7 | 380 | medium-high |
| 6 | `compact-mode` | 8 | 420 | high |
| 9 | `spaces-menu` | later | 260 | medium |

**Total for 1–8: ~1,410 lines.** With `spaces-menu`: ~1,670.

Rationale for the order: land `personal-branding` first because everything is
gated on `IsPersonalBuild()`; then the three cheapest, highest-confidence UI wins
(headerless panel, toolbar, left dock) so there is something to look at after the
first full compile; then `hide-tab-strip`, which is the first behavioural change
with real blast radius; then `window-tint` (cheap, and it proves the API-addition
recipe end to end, de-risking `glance`); then `glance`; and `compact-mode` last
because it is the only one that may need a second architectural attempt.

---

## 11. Dev loop

### One-time

```bash
cd packages/browseros
uv sync
# checkout already provisioned at ~/chromium/src (151.0.7922.137, pristine)
browseros build --preset debug --chromium-src ~/chromium/src --show-plan
```

`--show-plan` prints the composed step list without touching the checkout —
always do this first after editing a profile or a preset.

Debug plan (`bos_build/core/planner.py:259` `_plan_debug`), in order:
`provision → resources → bundled_extensions → chromium_replace → string_replaces
→ patches → configure → compile → package_macos`. No `series_patches`
(release-only), no signing, no upload.

### Full build

```bash
browseros build --preset debug --chromium-src ~/chromium/src \
  --gn-arg browseros_personal_build=true \
  --gn-arg enable_sparkle=false
```

Debug defaults (`planner.py:98-101`): `clean=False`, `provision=full`,
`sign=False`, `upload=False`. GN args from
`bos_build/config/gn/flags.macos.debug.gn`: `is_debug=true`,
`is_component_build=true`, `symbol_level=0`, `blink_symbol_level=0`,
`chrome_pgo_phase=0`, `use_system_xcode=true`. `--gn-arg` values are appended
last to `args.gn`, so they win.

**Timings:** the repo documents none. Realistic expectations on an M2 Pro /
16 GB with `is_component_build=true` and `symbol_level=0`:

| Change | Expect |
|---|---|
| Cold build (first compile) | 3–6 hours, and it will swap |
| One `.cc` in `chrome/browser/ui/views/**` | 2–6 min (link dominates) |
| `browseros_prefs.h` (widely included) | 20–45 min |
| `chrome_command_ids.h` / `chrome_action_id.h` | 45–90 min |
| A `.idl` (regenerates `chrome/common/extensions/api/*`) | 30–60 min |
| GN arg change | full reconfigure + near-full rebuild |

Implication for the order above: **batch all `browseros_prefs.h` additions into
one edit.** Add every pref for features 2–8 in a single pass even if the code
that reads them lands later. The same goes for `chrome_command_ids.h` and
`chrome_action_id.h`.

The 100 GB disk requirement (`packages/browseros/README.md:25`) still stands;
`~/chromium/src` is 6.6 GB checked out and will grow to ~60–90 GB with `out/`.
**Check free space before the first compile** — `CLAUDE.md` is explicit about
this.

### Resuming

```bash
# recompile only, skip re-applying patches
browseros build --preset debug -S ~/chromium/src --from compile
# repackage only
browseros build --preset debug -S ~/chromium/src --from package_macos
```

`--from` slices the composed timeline; `configure` is the only step that writes
`args.gn`, so a plan starting at `compile` reuses the existing file including
previous `--gn-arg` overrides.

**Build lock:** every build takes an exclusive lock on the checkout, keyed by
resolved `src` path. A second build fails fast naming the holder; `--lock-wait`
queues instead.

### Editing → capturing patches

Work **directly in `~/chromium/src`**, then extract:

```bash
# one file
browseros dev -S ~/chromium/src extract patch chrome/browser/ui/views/frame/browser_view.cc --feature
# everything in a commit
browseros dev -S ~/chromium/src extract commit HEAD --feature
# a range
browseros dev -S ~/chromium/src extract range <start> <end> --squash --feature
```

There is **no top-level `browseros extract`** — the README at
`packages/browseros/README.md:88-99` is stale (it also lists `setup`, `apply`,
`package`, `sign`, none of which exist). Extraction is `browseros dev extract`.

The diff base is `packages/browseros/BASE_COMMIT`
(`patchkit/extract/common.py:25-40`), and `git diff <BASE_COMMIT> -- <path>`
picks up **unstaged working-tree changes** — you do not have to commit first.
New files are diffed with `git diff --no-index /dev/null <path>`.

`--feature` triggers the interactive picker (`patchkit/features_io.py:48-121`):
it lists existing features numbered plus "[Add new feature]", then appends the
paths to `.features.yaml`. Always pass it — a patch claimed by no feature is a
**hard doctor error**.

### Doctor

```bash
browseros dev doctor                              # registry hygiene only
browseros dev doctor --against ~/chromium/src     # + dry-run every patch (git apply --check)
browseros dev doctor --feature compact-mode --json
```

Checks (`patchkit/doctor.py`): feature names kebab-case (`:93`); descriptions
start with a valid prefix — `feat:`, `fix:`, `chore:`, `resource:`, `series:`
(`validation.py`); every `files:` entry resolves to a patch on disk, directory
entries non-empty (`:112`); unclassified patch = **error**, multi-claimed =
**warning** (`:148`). `--against` is read-only. Exit 0 / 1 findings / 2 usage.

Run `doctor --against` before every commit. It is the cheapest way to catch a
patch that will fail to apply after a rebase.

Also: `browseros product doctor` validates product-identity uniqueness and the
four required overlay branding files per product — run it if you touch §1.

### Where the `.app` lands

`Context.get_app_path()` (`bos_build/core/context.py:215-231`):

```
~/chromium/src/out/Default_{product}_{arch}/{app_base_name}.app
```

For this machine: **`~/chromium/src/out/Default_browseros_arm64/BrowserOS.app`**.

For **debug** macOS builds it first probes `"{app_base_name} Dev.app"` and uses
it if present — i.e. `~/chromium/src/out/Default_browseros_arm64/BrowserOS Dev.app`
is what the debug BRANDING (`PRODUCT_FULLNAME=BrowserOS Dev`, or `Browser` once
§1 lands) will actually produce. **Check both paths.**

DMGs (release only) go to
`packages/browseros/releases/{version}/{prefix}_v{version}_{arch}.dmg`
(`context.py:292` + `core/products.py:103`). Not needed for the dev loop.

### Running it with the personal launcher

`packages/browseros-agent/tools/personal/config.ts:18-23`:

```ts
const BRANDED_BINARY = '/Applications/Browser.app/Contents/MacOS/BrowserOS'
const STOCK_BINARY   = '/Applications/BrowserOS.app/Contents/MacOS/BrowserOS'
export const BROWSEROS_BINARY =
  process.env.BROWSEROS_PERSONAL_BINARY ||
  (existsSync(BRANDED_BINARY) ? BRANDED_BINARY : STOCK_BINARY)
```

So:

```bash
export BROWSEROS_PERSONAL_BINARY="$HOME/chromium/src/out/Default_browseros_arm64/BrowserOS.app/Contents/MacOS/BrowserOS"
# (or ".../BrowserOS Dev.app/Contents/MacOS/BrowserOS" for a debug-branded build)
cd packages/browseros-agent && bun run personal:start
```

Everything else the launcher owns is unchanged: profile
`~/Library/Application Support/Browser`, logs `~/Library/Logs/Browser/`, ports
CDP 9005 / server 9105 / extension 9305 / claw 9205.

**Note the inner executable name.** The launcher expects
`Contents/MacOS/BrowserOS`. That name comes from `app_base_name` (mac) and
`chrome/common/chrome_constants.cc` (`FPL("browseros")` on POSIX). If §1 is done
via Option A (a `personal` product with `display_name="Browser"`), the inner
binary becomes `Contents/MacOS/Browser` and `config.ts` needs a matching update.
If done via Option B (debug BRANDING only), it stays `BrowserOS`. One more
reason to start with Option B.

Once a native build works, `tools/personal/make-branded-app.sh` becomes dead
code — its own header comment says *"The proper fix is the native Chromium build
with the staged branding in packages/browseros/resources."* Delete it then.

---

## 12. What still needs confirmation

These are the only open questions; everything else above is verified against
`~/chromium/src` at 151.0.7922.137.

1. **`views::kViewIgnoredByLayoutKey` in `browser_view_tabbed_layout_impl.cc`** —
   does the tabbed layout impl honour it for `side_panel_`? Determines whether
   `compact-mode` can reuse the existing `SidePanel` view or needs a separate
   overlay widget (+150 lines). *Check: read
   `chrome/browser/ui/views/frame/layout/browser_view_tabbed_layout_impl.cc` and
   `browser_view_layout.cc`.*
2. **Mouse-move delivery over the web contents** — does a `views::View` sibling
   of `ContentsWebView` receive `OnMouseEntered` when the cursor crosses from the
   web contents? If not, `compact-mode` needs `ui::EventMonitor`. *Check
   empirically after the first build.*
3. **Escape in a `BubbleDialogDelegateView` hosting a `WebView`** — is VKEY_ESCAPE
   consumed by the renderer before the bubble sees it? Affects `glance`. *Check:
   `views::BubbleDialogDelegate::AcceleratorPressed` and how
   `ExtensionPopup` handles it.*
4. **Tab-search anchor when the strip is hidden** — is `TabSearchBubbleHost`'s
   anchor view nullable? Only matters if option 2 of §4 is taken. *Skippable if
   the sidebar route is used.*
5. **`ProductDescriptor.id` vs the `browseros_product` GN arg** — Option A of §1
   needs them decoupled. *Check `bos_build/core/products.py:120` and
   `context.py:324-334` (`get_product_gn_args`).*
6. **`SidePanelEntryKey::extension_id()`** — the accessor name used in §3's
   `ShouldHideSidePanelHeader`. *Check
   `chrome/browser/ui/side_panel/side_panel_entry_key.h`.*
7. **Cold-build wall time and peak disk** on this machine — no data exists.
   Measure the first build; it determines whether the whole plan is viable
   locally or must move to CI (`bos_build/docs/nightly-macos-ci.md`).
