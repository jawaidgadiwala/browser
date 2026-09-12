#!/usr/bin/env bash
# Build environment for Browser's own extension signing keys.
#
# Copy this file, keep the copy out of the repo, and `source` it before a
# source-mode native build:
#
#   source ~/.config/browser/build-env.sh
#   cd packages/browseros
#   uv run browseros build --resource-mode source ...
#
# The private keys live OUTSIDE the repo and are never committed:
#
#   ~/.config/browser/keys/agent-v2.pem   # classic app  (apps/app)
#   ~/.config/browser/keys/cockpit.pem    # neo cockpit  (apps/claw-app)
#
# Each PEM is an RSA-2048 private key (`openssl genrsa -out x.pem 2048`,
# chmod 600). bos_build hands the PEM contents to
# `chrome --pack-extension-key=<pem>`, and the extension id is the first 16
# bytes of sha256(DER SubjectPublicKeyInfo) mapped 0-9a-f -> a-p. The same
# public key is pinned as the manifest `key:` field in each app's
# wxt.config.ts, so the unpacked (dev) id and the packed (CRX) id agree.
#
# Regenerate the manifest key / id for a PEM:
#
#   openssl rsa -in agent-v2.pem -pubout -outform DER | base64        # manifest key
#   openssl rsa -in agent-v2.pem -pubout -outform DER | shasum -a 256 # first 32 hex -> id
#
# Current ids (see docs/personal/native-build.md):
#   classic app   lmihdclmhdopaeappmadgmglglcabodf
#   neo cockpit   jllpmhghjcbaccmpindcmpkddjekbnmm

KEY_DIR="${BROWSER_KEY_DIR:-$HOME/.config/browser/keys}"

# --- required for `--product browseros --resource-mode source` ---------------
# bos_build/release/extensions/specs.py: spec "agent".signing_key_env
export BROWSEROS_AGENT_V2_KEY="$(cat "$KEY_DIR/agent-v2.pem")"

# --- required only for `--product browserclaw` (the neo cockpit product) -----
# spec "browserclaw".signing_key_env is BROWSERCLAW_KEY (not "COCKPIT_KEY"):
# the packer keys by spec, so the env var name comes from the spec table.
# That product also declares required_env=("VITE_CLAW_POSTHOG_KEY",); set a
# placeholder longer than one character if you build it without analytics.
export BROWSERCLAW_KEY="$(cat "$KEY_DIR/cockpit.pem")"
# export VITE_CLAW_POSTHOG_KEY="disabled"

# --- not needed for any browser build ---------------------------------------
# BROWSEROS_CONTROLLER_KEY signs the "controller" extension, which is built
# only by `browseros release extensions --name controller` from the external
# repo browseros-ai/BrowserOS-agent. No browser build step reads it.
# BUGREPORTER_KEY likewise signs upstream's feedback extension; source-mode
# builds DOWNLOAD that CRX prebuilt from the bundled manifest instead of
# signing it, so no key is required (only network access).
# export BROWSEROS_CONTROLLER_KEY="$(cat "$KEY_DIR/controller.pem")"
# export BUGREPORTER_KEY="$(cat "$KEY_DIR/bugreporter.pem")"

# --- optional ----------------------------------------------------------------
# Chrome/Chromium is required to pack CRX files; override auto-detection with:
# export CHROME_BINARY="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
# Point the bundled-extension manifest at our own feed with:
# export BUNDLED_EXTENSIONS_MANIFEST_URL="https://<our-cdn>/extensions/bundled-manifest.xml"
# (must be an http(s) URL: prepare_common_resources fetches it with requests;
# only the published-mode bundled_extensions step also accepts a local path.)
