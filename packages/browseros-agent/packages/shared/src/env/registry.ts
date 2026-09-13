import { z } from 'zod'

export type EnvMode = 'development' | 'production'
export type EnvSection =
  | 'dev-tools'
  | 'app'
  | 'claw'
  | 'personal'
  | 'server'
  | 'build'
  | 'upload'
  | 'sign'

export interface EnvExampleEntry {
  value: string
  commented?: boolean
}

export interface EnvKeySpec {
  key: string
  section: EnvSection
  description: string
  secret: boolean
  schema: z.ZodType<string>
  modes: Partial<Record<EnvMode, EnvExampleEntry>>
}

const stringSchema = z.string()
/** A URL, or empty to mean "this endpoint is not configured". */
const optionalUrlSchema = z.union([z.literal(''), z.string().url()])

/**
 * Placeholder config URL for the hosted model gateway. `.invalid` is reserved
 * and never resolves, so a build carrying it cannot phone anyone home.
 */
const SERVER_CONFIG_URL_PLACEHOLDER =
  'https://browseros.invalid/api/browseros-server/config'
const portSchema = z.string().refine((value) => {
  if (!/^\d+$/.test(value)) {
    return false
  }
  const port = Number(value)
  return port >= 1 && port <= 65535
}, 'integer port between 1 and 65535')

export const ENV_REGISTRY: readonly EnvKeySpec[] = [
  {
    key: 'CDP_PROTOCOL_JSON',
    section: 'dev-tools',
    description: 'CDP protocol JSON input for browser protocol codegen.',
    secret: false,
    schema: stringSchema,
    modes: {
      development: {
        value:
          '/path/to/chromium/src/out/Default_arm64/gen/third_party/blink/public/devtools_protocol/protocol.json',
        commented: true,
      },
    },
  },
  {
    key: 'BROWSEROS_BINARY',
    section: 'dev-tools',
    description: 'BrowserOS binary used by app and Claw development.',
    secret: false,
    schema: stringSchema,
    modes: {
      development: {
        value: '/Applications/BrowserOS.app/Contents/MacOS/BrowserOS',
      },
    },
  },
  {
    key: 'BROWSEROS_CDP_PORT',
    section: 'app',
    description: 'Chromium remote debugging port for app development.',
    secret: false,
    schema: portSchema,
    modes: { development: { value: '9005' } },
  },
  {
    key: 'BROWSEROS_SERVER_PORT',
    section: 'app',
    description:
      'BrowserOS server port, also used as the Claw browser launch port.',
    secret: false,
    schema: portSchema,
    modes: { development: { value: '9105' } },
  },
  {
    key: 'BROWSEROS_EXTENSION_PORT',
    section: 'app',
    description: 'Extension dev server port for app development.',
    secret: false,
    schema: portSchema,
    modes: { development: { value: '9305' } },
  },
  {
    key: 'BROWSEROS_EXTRA_EXTENSIONS',
    section: 'app',
    description:
      'Optional comma-separated unpacked extension dirs the app dev browser also loads; tools/dev sets this for watch --with-claw.',
    secret: false,
    schema: stringSchema,
    modes: {
      development: {
        value: '/path/to/apps/claw-app/dist/chrome-mv3-dev',
        commented: true,
      },
    },
  },
  {
    key: 'VITE_PUBLIC_POSTHOG_KEY',
    section: 'app',
    description: 'Browser bundle PostHog key.',
    secret: true,
    schema: stringSchema,
    modes: { development: { value: '' } },
  },
  {
    key: 'VITE_PUBLIC_POSTHOG_HOST',
    section: 'app',
    description: 'Browser bundle PostHog host.',
    secret: false,
    schema: stringSchema,
    modes: { development: { value: '' } },
  },
  {
    key: 'VITE_PUBLIC_SENTRY_DSN',
    section: 'app',
    description: 'Browser bundle Sentry DSN.',
    secret: false,
    schema: stringSchema,
    modes: { development: { value: '' } },
  },
  {
    key: 'VITE_PUBLIC_BROWSEROS_API',
    section: 'app',
    description:
      'Hosted account/API URL exposed to the browser bundle. Empty by default:\nthis product ships no hosted service, so the manifest grants no host\npermissions and nothing seeds a hosted LLM provider.',
    secret: false,
    schema: optionalUrlSchema,
    modes: { development: { value: '' } },
  },
  {
    key: 'VITE_ALPHA_FEATURES',
    section: 'app',
    description: 'Alpha feature flag for the browser bundle.',
    secret: false,
    schema: stringSchema,
    modes: { development: { value: 'true' } },
  },
  {
    key: 'GRAPHQL_SCHEMA_PATH',
    section: 'app',
    description:
      'Optional GraphQL schema path; falls back to schema/schema.graphql.',
    secret: false,
    schema: stringSchema,
    modes: {
      development: {
        value: '/path/to/api-repo/.../schema.graphql',
        commented: true,
      },
    },
  },
  {
    key: 'SENTRY_AUTH_TOKEN',
    section: 'app',
    description: 'Sentry auth token for source-map uploads.',
    secret: true,
    schema: stringSchema,
    modes: { development: { value: '' } },
  },
  {
    key: 'SENTRY_ORG',
    section: 'app',
    description: 'Sentry organization for source-map uploads.',
    secret: false,
    schema: stringSchema,
    modes: { development: { value: '' } },
  },
  {
    key: 'SENTRY_PROJECT',
    section: 'app',
    description: 'Sentry project for source-map uploads.',
    secret: false,
    schema: stringSchema,
    modes: { development: { value: '' } },
  },
  {
    key: 'VITE_BROWSEROS_CLAW_API_URL',
    section: 'claw',
    description:
      'Optional Claw API base URL override; tools/dev injects this in dev:claw flows and real env wins.',
    secret: false,
    schema: stringSchema,
    modes: {
      development: { value: 'http://127.0.0.1:9200', commented: true },
    },
  },
  {
    key: 'BROWSEROS_USER_DATA_DIR',
    section: 'claw',
    description:
      'Optional Chromium user data directory override for Claw dev browser launches.',
    secret: false,
    schema: stringSchema,
    modes: { development: { value: '/tmp/my-browseros-dev', commented: true } },
  },
  {
    key: 'BROWSEROS_CLAW_CDP_PORT',
    section: 'claw',
    description:
      'Optional Chromium remote debugging port override shared by Claw app and server dev.',
    secret: false,
    schema: portSchema,
    modes: { development: { value: '49337', commented: true } },
  },
  {
    key: 'BROWSEROS_CLAW_EMBEDDED',
    section: 'claw',
    description:
      'Set to 1 to build the Claw app for loading next to the BrowserOS app (no newtab override, no browser launch); tools/dev sets this for watch --with-claw.',
    secret: false,
    schema: stringSchema,
    modes: { development: { value: '1', commented: true } },
  },
  {
    key: 'BROWSERCLAW_DIR',
    section: 'claw',
    description: 'Optional BrowserClaw state root override.',
    secret: false,
    schema: stringSchema,
    modes: { development: { value: '~/.browserclaw-dev', commented: true } },
  },
  {
    key: 'CLAW_POSTHOG_KEY',
    section: 'claw',
    description:
      'Claw server PostHog project key required by production builds.',
    secret: true,
    schema: stringSchema,
    modes: { development: { value: '' }, production: { value: '' } },
  },
  {
    key: 'CLAW_POSTHOG_HOST',
    section: 'claw',
    description:
      'Optional Claw server PostHog host; defaults to PostHog US Cloud.',
    secret: false,
    schema: stringSchema,
    modes: {
      development: {
        value: 'https://us.i.posthog.com',
        commented: true,
      },
      production: {
        value: 'https://us.i.posthog.com',
        commented: true,
      },
    },
  },
  {
    key: 'VITE_CLAW_POSTHOG_KEY',
    section: 'claw',
    description:
      'BrowserClaw PostHog project key embedded in the shipped client bundle; required by production builds.',
    secret: true,
    schema: stringSchema,
    modes: { development: { value: '' }, production: { value: '' } },
  },
  {
    key: 'VITE_CLAW_POSTHOG_HOST',
    section: 'claw',
    description:
      'Optional BrowserClaw bundle PostHog host; defaults to PostHog US Cloud.',
    secret: false,
    schema: stringSchema,
    modes: {
      development: {
        value: 'https://us.i.posthog.com',
        commented: true,
      },
      production: {
        value: 'https://us.i.posthog.com',
        commented: true,
      },
    },
  },
  {
    key: 'BROWSEROS_PERSONAL_PROFILE',
    section: 'personal',
    description:
      'Optional persistent Chromium profile override for the personal daily-driver launcher (tools/personal).',
    secret: false,
    schema: stringSchema,
    modes: {
      development: {
        value: '~/Library/Application Support/Browser',
        commented: true,
      },
    },
  },
  {
    key: 'BROWSEROS_PERSONAL_LOG_DIR',
    section: 'personal',
    description:
      'Optional log directory override for the personal daily-driver launcher.',
    secret: false,
    schema: stringSchema,
    modes: {
      development: {
        value: '~/Library/Logs/Browser',
        commented: true,
      },
    },
  },
  {
    key: 'BROWSEROS_PERSONAL_BINARY',
    section: 'personal',
    description:
      'Optional BrowserOS app binary override for the personal daily-driver launcher.',
    secret: false,
    schema: stringSchema,
    modes: {
      development: {
        value: '/Applications/BrowserOS.app/Contents/MacOS/BrowserOS',
        commented: true,
      },
    },
  },
  {
    key: 'BROWSEROS_PERSONAL_STATE_DIR',
    section: 'personal',
    description:
      'Optional BrowserOS server state root for the personal launcher; keeps daily-driver data out of the dev loop state.',
    secret: false,
    schema: stringSchema,
    modes: {
      development: { value: '~/.browseros-personal', commented: true },
    },
  },
  {
    key: 'BROWSEROS_PERSONAL_CLAW_STATE_DIR',
    section: 'personal',
    description: 'Optional BrowserClaw state root for the personal launcher.',
    secret: false,
    schema: stringSchema,
    modes: {
      development: { value: '~/.browserclaw-personal', commented: true },
    },
  },
  {
    key: 'BROWSEROS_PERSONAL_CDP_PORT',
    section: 'personal',
    description: 'Chromium remote debugging port for the personal launcher.',
    secret: false,
    schema: portSchema,
    modes: { development: { value: '9005', commented: true } },
  },
  {
    key: 'BROWSEROS_PERSONAL_SERVER_PORT',
    section: 'personal',
    description: 'Bun server port for the personal launcher.',
    secret: false,
    schema: portSchema,
    modes: { development: { value: '9105', commented: true } },
  },
  {
    key: 'BROWSEROS_PERSONAL_EXTENSION_PORT',
    section: 'personal',
    description: 'Extension port for the personal launcher.',
    secret: false,
    schema: portSchema,
    modes: { development: { value: '9305', commented: true } },
  },
  {
    key: 'BROWSEROS_PERSONAL_CLAW_PORT',
    section: 'personal',
    description: 'Rust claw-server port for the personal launcher.',
    secret: false,
    schema: portSchema,
    modes: { development: { value: '9205', commented: true } },
  },
  {
    key: 'BROWSEROS_CONFIG_URL',
    section: 'server',
    description:
      'Hosted model gateway config URL. Defaults to a never-resolving\nplaceholder: this product ships no hosted gateway, and the server treats an\nempty or `.invalid` value as "hosted model features are off".',
    secret: false,
    schema: optionalUrlSchema,
    modes: {
      development: {
        value: SERVER_CONFIG_URL_PLACEHOLDER,
      },
      production: {
        value: SERVER_CONFIG_URL_PLACEHOLDER,
      },
    },
  },
  {
    key: 'BROWSEROS_TRUSTED_ORIGINS',
    section: 'server',
    description: 'Trusted origins for local server development.',
    secret: false,
    schema: stringSchema,
    modes: { development: { value: '' } },
  },
  {
    key: 'POSTHOG_API_KEY',
    section: 'server',
    description: 'Server telemetry key; CLI release builds read the same key.',
    secret: true,
    schema: stringSchema,
    modes: { development: { value: '' }, production: { value: '' } },
  },
  {
    key: 'SENTRY_DSN',
    section: 'server',
    description: 'Server Sentry DSN.',
    secret: false,
    schema: stringSchema,
    modes: {
      development: { value: '' },
      production: { value: '' },
    },
  },
  {
    key: 'NODE_ENV',
    section: 'server',
    description: 'Node environment for server and build scripts.',
    secret: false,
    schema: stringSchema,
    modes: {
      development: { value: 'development' },
      production: { value: 'production' },
    },
  },
  {
    key: 'LOG_LEVEL',
    section: 'server',
    description: 'Server log level.',
    secret: false,
    schema: stringSchema,
    modes: { development: { value: 'info' }, production: { value: 'info' } },
  },
  {
    key: 'BROWSEROS_AI_SDK_DEVTOOLS',
    section: 'server',
    description:
      'Optional AI SDK DevTools capture toggle for local server runs.',
    secret: false,
    schema: stringSchema,
    modes: { development: { value: 'true', commented: true } },
  },
  {
    key: 'BROWSEROS_TEST_HEADLESS',
    section: 'server',
    description: 'Headless browser setting for local server tests.',
    secret: false,
    schema: stringSchema,
    modes: { development: { value: 'true' } },
  },
  {
    key: 'R2_ACCOUNT_ID',
    section: 'upload',
    description: 'R2 account ID for production artifact uploads.',
    secret: true,
    schema: stringSchema,
    modes: { production: { value: '' } },
  },
  {
    key: 'R2_ACCESS_KEY_ID',
    section: 'upload',
    description: 'R2 access key ID for production artifact uploads.',
    secret: true,
    schema: stringSchema,
    modes: { production: { value: '' } },
  },
  {
    key: 'R2_SECRET_ACCESS_KEY',
    section: 'upload',
    description: 'R2 secret access key for production artifact uploads.',
    secret: true,
    schema: stringSchema,
    modes: { production: { value: '' } },
  },
  {
    key: 'R2_BUCKET',
    section: 'upload',
    description: 'R2 bucket for production artifact uploads.',
    secret: false,
    schema: stringSchema,
    modes: { production: { value: 'browseros' } },
  },
  {
    key: 'ESIGNER_USERNAME',
    section: 'sign',
    description:
      'BrowserOS build eSigner username for Windows production signing.',
    secret: false,
    schema: stringSchema,
    modes: { production: { value: '' } },
  },
  {
    key: 'ESIGNER_PASSWORD',
    section: 'sign',
    description:
      'BrowserOS build eSigner password for Windows production signing.',
    secret: true,
    schema: stringSchema,
    modes: { production: { value: '' } },
  },
  {
    key: 'ESIGNER_TOTP_SECRET',
    section: 'sign',
    description:
      'BrowserOS build eSigner TOTP secret for Windows production signing.',
    secret: true,
    schema: stringSchema,
    modes: { production: { value: '' } },
  },
  {
    key: 'ESIGNER_CREDENTIAL_ID',
    section: 'sign',
    description:
      'BrowserOS build eSigner credential ID for Windows production signing.',
    secret: false,
    schema: stringSchema,
    modes: { production: { value: '' } },
  },
]

/** Finds a registry entry for callers that validate or report individual keys. */
export function findEnvKeySpec(key: string): EnvKeySpec | undefined {
  return ENV_REGISTRY.find((spec) => spec.key === key)
}
