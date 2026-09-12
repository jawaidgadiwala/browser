# Native Chromium patches — batch 1

Implements the first five features of `docs/personal/native-patches-plan.md`
against Chromium **151.0.7922.137** (`BASE_COMMIT` `8f5d36bc16`), plus the
product-identity rebrand to **Browser** by **Jawaid Gadiwala**.

`window-tint`, `glance`, `compact-mode` and `spaces-menu` are **not** in this
batch.

## Gating model

One new header, `chrome/browser/browseros/core/browseros_browser_product.h`:

```cpp
inline constexpr bool kBrowserProduct = true;
constexpr bool IsBrowserProduct() { return kBrowserProduct; }
```

`IsBrowserProduct()` is **only ever used as the default value of a
`browseros.*` preference** — never as an `#if` at a call site. Because
`BrowserOSSetPrefFunction` allowlists by the `browseros.` prefix alone, every
pref below is already readable and writable from the extension with no IDL,
histogram or allowlist change:

```js
chrome.browserOS.setPref('browseros.hide_tab_strip', false)
```

So stock Chromium behaviour is always exactly one flip away. Upgrade path to a
real GN arg (`browseros_browser_product` → `BUILDFLAG(...)`) is documented in
the header; no caller changes needed.

New prefs (all registered in `browseros::RegisterProfilePrefs`):

| Pref | Default | Effect |
|---|---|---|
| `browseros.side_panel_left` | `IsBrowserProduct()` → true | mirrors (inverted) onto `prefs::kSidePanelHorizontalAlignment` |
| `browseros.hide_side_panel_header` | true | drops the native header for BrowserOS extension panels |
| `browseros.hide_tab_strip` | true | `BrowserView::ShouldDrawTabStrip()` returns false |
| `browseros.show_llm_chat` | **flipped to false** | Chat action not pinned |
| `browseros.show_assistant` | **flipped to false** | Assistant (agent) action not pinned |
| `browseros.show_toolbar_labels` | **flipped to false** | follows the same default |

---

## Features

### `browser-branding`

| File | Change |
|---|---|
| `chromium_patches/chrome/browser/browseros/core/browseros_browser_product.h` | **new** — the product switch |
| `chromium_patches/chrome/browser/browseros/core/BUILD.gn` | adds the header to `source_set("core")` |
| `chromium_files/products/browseros/chrome/app/theme/chromium/BRANDING.release` | `PRODUCT_FULLNAME/SHORTNAME=Browser`, `COMPANY_*=Jawaid Gadiwala`, `MAC_BUNDLE_ID=com.jawaidgadiwala.browser` |
| `…/BRANDING.debug` | `Browser Dev`, `com.jawaidgadiwala.browser.dev` |
| `chromium_files/products/browseros/chrome/updater/branding.gni` | updater/Keystone identity → Browser / `com.jawaidgadiwala.browser.*` |
| `chromium_files/products/browseros/chrome/enterprise_companion/branding.gni` | same |
| `bos_build/products/browseros/product.py` | `company="Jawaid Gadiwala"`, explicit `mac=`/`windows=` identity, `string_replacements=_replacements("Browser")` |
| `chromium_patches/chrome/browser/mac/sparkle_glue.mm` | appcast base URL is now a constant that defaults to `""` → `feedURLStringForUpdater:` returns `nil` and updates are inert; Sparkle stays compiled in |

**Verify:** About page and the macOS menu bar read “Browser”; `Browser -
<version>` on `chrome://settings/help`; `codesign -dv --verbose=4
<app>` (or `defaults read <app>/Contents/Info CFBundleIdentifier`) shows
`com.jawaidgadiwala.browser`; no update check fires and the log shows
`Sparkle: No update feed configured; updates are off.`

**Bundle-id change — consequences (the plan recommended keeping the old id; the
user overrode it):**

1. **Keychain “Safe Storage”.** `components/os_crypt/common/keychain_password_mac.mm`
   keys on the literal strings `"BrowserOS Safe Storage"` / `"BrowserOS"`, not
   on the bundle id, so saved passwords are **not** re-keyed by this change and
   keep working. Deliberately left alone.
2. **Profile directory.** `CrProductDirName` comes from
   `browseros_product_dir_name` in `buildflags.gni` (`"BrowserOS"`), also
   independent of the bundle id — the profile stays at
   `~/Library/Application Support/BrowserOS`. Deliberately left alone.
3. **TCC / permissions.** Camera, microphone, screen recording, Full Disk
   Access, Accessibility and Keychain ACLs are keyed on bundle id + team id:
   **every grant must be given once more** after the first launch of the new
   build.
4. **Default browser / LaunchServices.** The new id registers as a distinct
   app; “set as default browser” must be redone, and the old
   `/Applications/Browser.app` shim and the new build can coexist.
5. **Sparkle / updater identity.** Keystone bundle id, updater bundle id and
   the privileged-helper name all moved to `com.jawaidgadiwala.browser.*`. With
   no feed configured nothing runs, but an already-installed BrowserOS updater
   will no longer consider this app its client.
6. **Passkeys.** `app-entitlements-browseros.plist` uses
   `${CHROMIUM_BUNDLE_ID}`, so the keychain-access groups follow automatically —
   but a release signing run needs a **new provisioning profile** for
   `com.jawaidgadiwala.browser` (`PROD_MACOS_BROWSEROS_PASSKEY_PROFILE_PATH`).
   Not exercised by `--no-sign`.
7. **The `.app` is still named `BrowserOS.app`** with the inner executable
   `Contents/MacOS/BrowserOS`. `display_name` is intentionally unchanged because
   it derives `app_base_name`, and
   `packages/browseros-agent/tools/personal/config.ts` launches that exact path
   (out of scope for this batch). The *visible* name comes from BRANDING and
   from the string replacements. Renaming the bundle must land together with
   that agent-side change.

### `browser-side-panel-no-header`

| File | Change |
|---|---|
| `chrome/browser/ui/views/side_panel/side_panel_coordinator.cc` | header is skipped when the pref is on **and** the entry is `kExtension` for an active BrowserOS extension |
| `chrome/browser/ui/views/side_panel/BUILD.gn` | adds `//chrome/browser/browseros/core` to `public_deps` (for `browseros_constants.h`) |
| `browseros_prefs.{h,cc}` | `kHideSidePanelHeader` + `ShouldHideSidePanelHeader()` |

The header is a separate view painted over the border and `SidePanel::Layout`
skips it; the resize handle is a sibling view, so **resizing still works**.

**Verify:** open the agent side panel — no title row, no pin / new-tab / more /
close buttons; drag the inner edge and the panel still resizes; open Reading
List or History and the header is still there (non-extension entry).
`chrome.browserOS.setPref('browseros.hide_side_panel_header', false)` and
reopen — header returns.

> **Note:** with no header there is no close button. Close the panel from the
> extension UI or the accelerator until a toolbar Spaces action lands.

### `browser-toolbar`

Pure default flips in `browseros_prefs.cc`:
`show_toolbar_controls_by_default = !IsBrowserClawProduct() && !IsBrowserProduct()`.
`PinnedToolbarActionsModel::EnsureAlwaysPinnedActions()` already reacts to
these prefs, so the Chat and Assistant (dog) buttons are simply never pinned.
`features::kThirdPartyLlmPanel` stays enabled, so ⇧⌘K and the side panel entry
survive.

The Spaces toolbar action from §5 of the plan is **not** in this batch (it needs
a command id, an action id and pinning changes; the `browser-*` pref flips are
the shipping-relevant half).

**Verify:** fresh profile → toolbar has no dog and no Chat button; the extension
puzzle menu is untouched;
`chrome.browserOS.setPref('browseros.show_assistant', true)` re-pins it live.

### `browser-side-panel-left`

| File | Change |
|---|---|
| `browseros_prefs.{h,cc}` | `kSidePanelLeft`, `ApplySidePanelLeftPref()`, `SyncSidePanelLeftPref()` |
| `chrome/browser/ui/browser.cc` | `SyncSidePanelLeftPref()` at construction + `profile_pref_registrar_` entry |

`Sync…` only seeds the upstream pref while it `IsDefaultValue()`, so a user who
moved the panel keeps their choice. `Apply…` is unconditional and is the
registrar callback, so toggling the pref moves the panel live.

**Verify:** fresh profile → side panel opens on the **left**;
`chrome.browserOS.setPref('browseros.side_panel_left', false)` moves it to the
right without restart; move it by hand in settings, restart, and it stays where
you put it.

Deferred from the plan: `browseros.side_panel_default_width` and
`side_panel_open_on_startup` — the plan's own recommendation is to do the
auto-open in JS (`chrome.sidePanel.open()`), zero native lines.

### `browser-hide-tab-strip`

| File | Change |
|---|---|
| `chrome/browser/ui/views/frame/browser_view.cc` | `ShouldDrawTabStrip()` returns false when the pref is on; `registrar_` entry → `OnBrowserOSHideTabStripChanged()` |
| `chrome/browser/ui/views/frame/browser_view.h` | declares `OnBrowserOSHideTabStripChanged()` |

Gated at the **view** layer only. `Browser::SupportsWindowFeature` is untouched,
so tab dragging, session restore, tab-strip model assumptions and `chrome.tabs`
behave exactly as upstream. `ShouldDrawVerticalTabStrip()` calls
`ShouldDrawTabStrip()` first, so this kills both orientations with one gate.

**Verify:** new window has no horizontal and no vertical tab strip; ⌘T still
opens a tab and ⌘1–9 / ⌃Tab still switch; enter and leave fullscreen without a
layout glitch;
`chrome.browserOS.setPref('browseros.hide_tab_strip', false)` brings the strip
back **without a restart**.

Tab search lives inside the strip and is therefore hidden — per the plan, the
replacement is the sidebar tab tree in `apps/app`, not native work.

---

## Verbiage, icon and colour

* **Strings.** `string_replacements=_replacements("Browser")` in the product
  descriptor rewrites every `Chromium`/`Chrome`/`Google` occurrence in
  `chromium_strings.grd` and `settings_chromium_strings.grdp` to **Browser** —
  that is `IDS_PRODUCT_NAME`, the macOS menu bar, About, first run, the crash
  reporter and the copyright line (`The Browser Authors`). Copyright holder in
  BRANDING and the updater branding is **Jawaid Gadiwala**.
  The only hard-coded `"BrowserOS"` strings shown to a user were three, all now
  “Browser”: `browser_actions.cc` (`u"Ask Browser"`, the agent-installing
  infobar), `browser_command_controller.cc` (same infobar) and
  `about_page.html.ts` (`Browser - $i18n{aboutBrowserOSVersion}`). Remaining
  `BrowserOS` occurrences in the patch set are identifiers, namespaces, pref
  keys and log lines — not user-visible.
* **Icon.** `components/vector_icons/chat_orange.icon` is **replaced** by
  `components/vector_icons/browseros_mark.icon` — a geometric “B” with two
  knocked-out counters on the 48×48 canvas, monochrome so it tints with the
  button colour. `components/vector_icons/BUILD.gn` and `browser_actions.cc`
  (`vector_icons::kBrowserosMarkIcon`) follow. The Assistant action keeps
  `IDR_PRODUCT_LOGO_16`, which is staged from
  `resources/browseros/icons/product_logo_16.png` (already the new mark).
* **Colour.** `pinned_action_toolbar_button.cc` forced the Chat action's icon to
  `#FB6518`; it is now the brand blue `#2C6BF2`.
* **Bitmaps regenerated** from `branding/browser-icon-1024.png` (sips):
  `default_100_percent/{,linux/}product_logo_{16,32}.png`,
  `default_200_percent/product_logo_{16,32}.png`,
  `linux/product_logo_{24,48,64,128,256}.png`,
  `chromeos/{chrome_app_icon_32,chrome_app_icon_192,webstore_app_icon_16,webstore_app_icon_128}.png`,
  `product_logo_22.png`.

**Still on the old BrowserOS artwork (listed, not done — needs tooling this
machine does not have):**

- `resources/browseros/icons/win/*.ico` (`chromium.ico`, `chromium_doc.ico`,
  `chromium_pdf.ico`, `app_list.ico`, `incognito.ico`, `tiles/`) — needs an
  `.ico` encoder; blocks a Windows CI lane only.
- `resources/browseros/icons/linux/product_logo_32.xpm` — needs an XPM encoder.
- `product_logo_22_mono.png` (must be a monochrome silhouette, not a downscale)
  and the `product_logo_name_22*` wordmarks (still read “BrowserOS”).
- `resources/browseros/icons/product_logo.ai` / `chromium.ai` source files.
- Linux `ProductDescriptor.linux` identity (`package_name`, `desktop_id`,
  `launcher_name` = `browseros`) is unchanged on purpose — renaming it orphans
  paths for no gain until a Linux lane exists.

---

## Validation performed

```
uv run browseros dev doctor                      # 0 errors, 1 warning
uv run browseros dev doctor --against <tree>     # all 377 patches apply cleanly
uv run browseros product doctor                  # all products healthy
uv run python -m unittest discover -s bos_build -p "*_test.py" -t .   # 1248 OK
```

The apply check ran against a scratch tree of pristine 151.0.7922.137 files
copied out of `~/chromium/src` (which is read-only while a build is in flight),
not against the live checkout.

The one warning is expected: `browseros_browser_product.h` is claimed by both
`browser-branding` (for rebase bisecting, as the plan specifies) and
`browseros-core` (which claims the whole `chrome/browser/browseros/core/`
directory). Multi-claim is a warning, not an error.

**Not verifiable without a compile:** that everything builds; that
`vector_icons::kBrowserosMarkIcon` is the name `aggregate_vector_icons.py`
generates for `browseros_mark.icon`; that `gn check` accepts the include of
`browseros_prefs.h` from `browser_view.cc` (same `//chrome/browser/ui:ui` target
as `browser.cc`, which already includes it, so it should); that BRANDING
`PRODUCT_FULLNAME` really lands in `CFBundleName`/`CFBundleDisplayName`; the
visual result of the `.icon` path data.

## Build command for the second build

```bash
cd packages/browseros
uv run browseros build --preset release --product browseros --arch arm64 \
  --provision none --no-sign --no-upload --resource-mode published \
  --chromium-src ~/chromium/src
```

No `--gn-arg` is required. `enable_sparkle` stays `true` (the plan's option 1 was
dropped on the user's instruction: keep the updater, ship an empty feed).
`browseros_browser_product` is not a GN arg yet — the constant in
`browseros_browser_product.h` is the switch.

Output: `~/chromium/src/out/Default_browseros_arm64/BrowserOS.app`
(`app_base_name` is still `BrowserOS`; see consequence 7 above).
