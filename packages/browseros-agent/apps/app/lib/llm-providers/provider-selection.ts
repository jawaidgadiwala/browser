// Relative (not `@/`) so this module stays loadable under `bun test`, which
// resolves tsconfig `@/` aliases for erased type imports only, not values.
import { hostedProviderEnabled } from '../personal/personal-build'
import { HOSTED_PROVIDER_NAME } from '../personal/product'
import type { LlmProviderConfig } from './types'

export const DEFAULT_PROVIDER_ID = 'browseros'
export const DEFAULT_PROVIDER_NAME = HOSTED_PROVIDER_NAME

/** Resolves the persisted default id, repairing stale values to the first provider. */
export function resolveDefaultProviderId(
  providers: LlmProviderConfig[],
  defaultProviderId: string | null | undefined,
): string {
  if (
    defaultProviderId &&
    providers.some((provider) => provider.id === defaultProviderId)
  ) {
    return defaultProviderId
  }
  // With no hosted provider there is no id worth naming when the list is
  // empty; an empty string resolves to no selection and the surfaces show the
  // "add a provider" notice instead of pointing at a row that does not exist.
  if (providers.length === 0 && !hostedProviderEnabled()) return ''
  return providers[0]?.id ?? DEFAULT_PROVIDER_ID
}

/** Resolves the provider selected by the persisted default id. */
export function resolveSelectedProvider(
  providers: LlmProviderConfig[],
  defaultProviderId: string,
): LlmProviderConfig | null {
  return (
    providers.find((provider) => provider.id === defaultProviderId) ??
    providers[0] ??
    null
  )
}
