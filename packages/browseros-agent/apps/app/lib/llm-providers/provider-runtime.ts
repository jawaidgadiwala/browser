// Relative (not `@/`) so this module stays loadable under `bun test`, which
// resolves tsconfig `@/` aliases for erased type imports only, not values.
import { hostedProviderEnabled } from '../personal/personal-build'
import type { LlmProviderConfig } from './types'

/**
 * The one place every surface resolves a provider from a list, so it is also
 * the one place the upstream hosted provider is withheld. A profile upgraded
 * from a build that shipped it still has the row on the server and may still
 * name it as the default; neither may put it back into use.
 */
export function selectableChatProviders(
  providers: LlmProviderConfig[],
): LlmProviderConfig[] {
  if (hostedProviderEnabled()) return providers
  return providers.filter((provider) => provider.type !== 'browseros')
}

export function findChatProviderById(
  providers: LlmProviderConfig[],
  providerId?: string | null,
): LlmProviderConfig | null {
  if (!providerId) return null
  return (
    selectableChatProviders(providers).find(
      (provider) => provider.id === providerId,
    ) ?? null
  )
}

export function resolveChatProvider(
  providers: LlmProviderConfig[],
  preferredProviderId?: string | null,
): LlmProviderConfig | null {
  const selectable = selectableChatProviders(providers)
  if (preferredProviderId) {
    const preferred = findChatProviderById(selectable, preferredProviderId)
    if (preferred) return preferred
  }
  return selectable[0] ?? null
}
