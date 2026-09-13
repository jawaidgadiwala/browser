#!/usr/bin/env python3
"""BrowserOS — the flagship product."""

from pathlib import Path

from ...core.products import (
    BROWSEROS_AGENT_EXTENSION_ID,
    MacProductIdentity,
    ProductDescriptor,
    WindowsProductIdentity,
    _replacements,
)
from ..server_binaries import ServerBundle, SignSpec

# Ships as "Browser" by Jawaid Gadiwala.
#
# `display_name` stays "BrowserOS" on purpose: it derives app_base_name, which
# names BrowserOS.app and its inner Contents/MacOS/BrowserOS executable, and
# packages/browseros-agent/tools/personal/config.ts launches that exact path.
# The user-visible name comes from the BRANDING overlay (PRODUCT_FULLNAME=
# Browser -> CFBundleName / CFBundleDisplayName) and from `string_replacements`
# below (IDS_PRODUCT_NAME -> menu bar, About page, first run, crash reporter).
# Renaming the bundle itself is a follow-up that must land together with the
# agent-side launcher path.
BROWSEROS_PRODUCT = ProductDescriptor.define(
    id="browseros",
    display_name="BrowserOS",
    company="Jawaid Gadiwala",
    windows_installer_guid="{5d8d08af-2df9-4da2-86c1-eac353a0ca32}",
    summary="A personal agentic browser",
    description="Browser is a privacy-focused web browser built on Chromium.",
    # The AGPL source offer and the only support channel Browser has: its own
    # public repository. These are baked into About, the Linux metainfo and the
    # Windows installer, so they must never fall back to upstream's defaults.
    homepage_url="https://github.com/jawaidgadiwala/browser",
    support_url="https://github.com/jawaidgadiwala/browser",
    bugtracker_url="https://github.com/jawaidgadiwala/browser/issues",
    # Upstream's bug reporter extension is not shipped: its reports go to
    # upstream's inbox and it is built from a repository we do not control.
    required_extensions=((BROWSEROS_AGENT_EXTENSION_ID, "Browser agent"),),
    # Every Chromium string that says "Chromium"/"Chrome" becomes "Browser",
    # not the (bundle-derived) display name.
    string_replacements=_replacements("Browser"),
    # Bundle identity is the product's own, independent of the bundle *name*.
    # Keep in lockstep with MAC_BUNDLE_ID in
    # chromium_files/products/browseros/chrome/app/theme/chromium/BRANDING.*
    # and with mac_browser_bundle_identifier in chrome/updater/branding.gni.
    mac=MacProductIdentity(
        bundle_id="com.jawaidgadiwala.browser",
        dev_bundle_id="com.jawaidgadiwala.browser.dev",
        signing_identifier="com.jawaidgadiwala.browser",
        dev_signing_identifier="com.jawaidgadiwala.browser.dev",
        framework_name="BrowserOS Framework.framework",
        dev_framework_name="BrowserOS Dev Framework.framework",
        dmg_volume_name="Browser",
    ),
    windows=WindowsProductIdentity(
        app_user_model_id="JawaidGadiwala.Browser",
        installer_app_id="{5d8d08af-2df9-4da2-86c1-eac353a0ca32}",
    ),
)

BROWSEROS_SERVER_BUNDLE = ServerBundle(
    id="browseros-server",
    name="BrowserOS Server",
    product_ids=("browseros",),
    chromium_output_root="BrowserOSServer",
    local_resources_root=Path("resources/binaries/browseros_server"),
    chromium_resources_root=Path("chrome/browser/browseros/server/resources"),
    macos_bundle_resources_root=Path(
        "Contents/Resources/BrowserOSServer/default/resources"
    ),
    windows_bundle_resources_root=Path("BrowserOSServer/default/resources"),
    macos_binaries={
        "browseros_server": SignSpec(
            "browseros_server", "runtime", "browseros-executable-entitlements.plist"
        ),
        "bun": SignSpec("bun", "runtime", "browseros-executable-entitlements.plist"),
        "rg": SignSpec("rg", "runtime"),
    },
    windows_binaries=("browseros_server.exe",),
    source_builder="bun",
    source_component="server",
    runtime_binary_name="browseros_server",
)
