# Update feeds (placeholders)

Every feed in this directory is **intentionally empty**. Browser does not
publish an update feed yet: there is no CDN of ours, no signed release, and no
installer. These files exist so that the shapes the build pipeline and the
updaters expect are present and valid, and so that nothing in the tree points at
someone else's binaries.

They replaced the upstream BrowserOS feeds that were checked in here, which
listed upstream versions, upstream CDN URLs, and upstream signatures. Shipping
those would have auto-updated Browser installs into upstream builds.

## What each file is

| Path | Format | Read by |
| --- | --- | --- |
| `browser/appcast*.xml` | Sparkle / WinSparkle appcast (RSS 2.0, `sparkle:` namespace) | the browser's own updater (macOS Sparkle, Windows WinSparkle) |
| `server/appcast-*server*.xml` | Sparkle appcast | the sidecar server updater |
| `extensions/extensions.json`, `extensions.alpha.json` | JSON map of extension id to `external_update_url` | Chromium's external-extension loader |
| `extensions/update-manifest*.xml`, `bundled-manifest.xml` | Omaha/`gupdate` update manifest | Chromium's extension updater |

"Empty but valid" means: an appcast channel with no `<item>`, a `<gupdate>`
element with no `<app>`, and `{"extensions": {}}`. An updater that fetches one
of these concludes there is nothing to install, rather than erroring.

## `upload.sh`

`upload.sh` is the local publish helper; it shells out to
`uv run browseros release feeds publish-local` for the selected feed keys. It is
kept so the plumbing stays exercised, but publishing these placeholders is a
no-op by design. Its menu labels still use upstream file naming, matching the
feed filenames the pipeline expects.

## When we have a real feed

1. Stand up our own feed host, and point the native defaults at it (the
   Sparkle/WinSparkle base URLs and the extension config/update URLs; see
   `docs/personal/whitelabel-audit.md` items B3, B4, B5, B11).
2. Generate real appcasts from a signed release, with our own EdDSA signing key.
3. Regenerate the extension manifests from our own CRX ids and versions (see
   `docs/personal/native-build.md` for the keys and ids we sign with).

Until then: leave these empty. Do not copy upstream feeds back in.
