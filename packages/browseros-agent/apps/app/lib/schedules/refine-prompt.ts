import { getAgentServerUrl } from '@/lib/browseros/helpers'
import {
  createDefaultBrowserOSProvider,
  defaultProviderIdStorage,
} from '@/lib/llm-providers/storage'
import type { LlmProviderConfig } from '@/lib/llm-providers/types'
import { hostedProviderEnabled } from '@/lib/personal/personal-build'
import { PRODUCT_NAME } from '@/lib/personal/product'
import { listProvidersOrNull } from '@/modules/llm-providers/llm-providers.api'
import {
  findChatProviderById,
  resolveChatProvider,
} from '../llm-providers/provider-runtime'

const resolveProvider = async (
  providerId?: string,
): Promise<LlmProviderConfig> => {
  const loaded = await listProvidersOrNull()
  // Same rule as the scheduled run: the configured default is a choice too, and
  // its model and credentials are in the list that failed to load. Callers here
  // already catch and surface this.
  if (loaded === null) {
    throw new Error(
      `Cannot reach the ${PRODUCT_NAME} server to load the selected provider`,
    )
  }

  const providers = loaded
  if (providers.length) {
    const explicitProvider = findChatProviderById(providers, providerId)
    if (explicitProvider) return explicitProvider

    const defaultProviderId = await defaultProviderIdStorage.getValue()
    const provider = resolveChatProvider(providers, defaultProviderId)
    if (provider) return provider
  }
  if (!hostedProviderEnabled()) {
    throw new Error(
      'No AI provider configured. Add one in Settings -> AI & Agents.',
    )
  }
  return createDefaultBrowserOSProvider()
}

interface RefinePromptResponse {
  success: boolean
  refined?: string
  message?: string
}

export async function refinePrompt(params: {
  prompt: string
  name: string
  providerId?: string
}): Promise<string> {
  const agentServerUrl = await getAgentServerUrl()
  const provider = await resolveProvider(params.providerId)

  const response = await fetch(`${agentServerUrl}/refine-prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: params.prompt,
      name: params.name,
      provider: provider.type,
      model: provider.modelId ?? 'default',
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
      resourceName: provider.resourceName,
      accessKeyId: provider.accessKeyId,
      secretAccessKey: provider.secretAccessKey,
      region: provider.region,
      sessionToken: provider.sessionToken,
    }),
  })

  if (!response.ok) {
    const errorData = (await response
      .json()
      .catch(() => null)) as RefinePromptResponse | null
    throw new Error(errorData?.message ?? `Request failed: ${response.status}`)
  }

  const data = (await response.json()) as RefinePromptResponse
  if (!data.success || !data.refined) {
    throw new Error(data.message ?? 'Failed to refine prompt')
  }

  return data.refined
}
