/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { CLAW_API_PORT_DEFAULT } from './ports'

export const MCP_PATH = '/mcp'
export const BROWSEROS_MCP_SERVER_NAME = 'browser'

export function canonicalMcpUrlForPort(port = CLAW_API_PORT_DEFAULT): string {
  return `http://127.0.0.1:${port}${MCP_PATH}`
}

/**
 * Endpoints this product does not operate are placeholders or empty, never a
 * third party's host:
 * - `CDN`: never-resolving placeholder until we publish our own release CDN.
 *   Release upload scripts take an explicit base URL instead.
 * - `KLAVIS_PROXY`: empty, which disables managed integrations (the connector
 *   catalog and Strata session) rather than routing a user's connector traffic
 *   through someone else's proxy. Set it to your own proxy to re-enable them.
 * - `POSTHOG_DEFAULT`: the vendor's own ingest host, used only when a PostHog
 *   key is configured; telemetry stays off while the key is empty.
 */
export const EXTERNAL_URLS = {
  CDN: 'https://cdn.browseros.invalid',
  KLAVIS_PROXY: '',
  POSTHOG_DEFAULT: 'https://us.i.posthog.com',
  OPENAI_AUTH: 'https://auth.openai.com/oauth/authorize',
  OPENAI_TOKEN: 'https://auth.openai.com/oauth/token',
  GITHUB_DEVICE_CODE: 'https://github.com/login/device/code',
  GITHUB_OAUTH_TOKEN: 'https://github.com/login/oauth/access_token',
  GITHUB_COPILOT_API: 'https://api.githubcopilot.com',
  QWEN_DEVICE_CODE: 'https://chat.qwen.ai/api/v1/oauth2/device/code',
  QWEN_OAUTH_TOKEN: 'https://chat.qwen.ai/api/v1/oauth2/token',
  QWEN_CODE_API: 'https://portal.qwen.ai/v1',
} as const
