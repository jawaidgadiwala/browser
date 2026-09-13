#!/usr/bin/env python3
"""BrowserOS — the flagship product."""

from pathlib import Path

from ...core.products import (
    BROWSEROS_AGENT_EXTENSION_ID,
    LinuxProductIdentity,
    MacProductIdentity,
    ProductDescriptor,
    WindowsProductIdentity,
)
from ..server_binaries import ServerBundle, SignSpec

# Ships as "Browser" by Jawaid Gadiwala.
#
# `display_name` is the single source of the bundle name: it derives
# app_base_name (Browser.app and its inner Contents/MacOS/Browser),
# artifact_prefix (Browser_v<version>_<arch>.dmg), the macOS framework name,
# the installer names and the string replacements that rewrite every Chromium
# string. It matches PRODUCT_FULLNAME in
# chromium_files/products/browseros/chrome/app/theme/chromium/BRANDING.release,
# which is what Chromium's own build names the app, the framework and the
# helper apps. The two must stay equal or bos_build looks for an app that the
# compile step never produced.
#
# `id` stays "browseros": it is the registry key (`--product browseros`), the
# GN `browseros_product` value, the chromium_files/products/<id> overlay
# directory and the R2 release prefix — none of which are user-visible.
BROWSEROS_PRODUCT = ProductDescriptor.define(
    id="browseros",
    display_name="Browser",
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
    # string_replacements is derived from display_name ("Browser"), so every
    # Chromium string that says "Chromium"/"Chrome"/"Google" becomes "Browser".
    # Bundle identity is the product's own, independent of the bundle *name*.
    # Keep in lockstep with MAC_BUNDLE_ID in
    # chromium_files/products/browseros/chrome/app/theme/chromium/BRANDING.*
    # and with mac_browser_bundle_identifier in chrome/updater/branding.gni.
    mac=MacProductIdentity(
        bundle_id="com.jawaidgadiwala.browser",
        dev_bundle_id="com.jawaidgadiwala.browser.dev",
        signing_identifier="com.jawaidgadiwala.browser",
        dev_signing_identifier="com.jawaidgadiwala.browser.dev",
        # Derived from display_name by convention; spelled out because the
        # compile step's output must match byte for byte.
        framework_name="Browser Framework.framework",
        dev_framework_name="Browser Dev Framework.framework",
        dmg_volume_name="Browser",
    ),
    # Linux identifiers derive from `id` by convention, which would ship a
    # "browseros" package, launcher and /usr/lib dir. Name them after the
    # product instead; the .desktop id and AppStream id follow the launcher.
    linux=LinuxProductIdentity(
        package_name="browser",
        launcher_name="browser",
        desktop_id="browser.desktop",
        icon_name="browser",
        lib_dir="/usr/lib/browser",
        appimage_dir="/opt/browser",
        apparmor_profile_name="browser",
        metainfo_id="browser.desktop",
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
