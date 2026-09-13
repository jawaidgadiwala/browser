import { UNCONFIGURED_API_ORIGIN } from '@/lib/browseros-api-url'
import { env } from '@/lib/env'
import {
  RuntimeMessageType,
  sendRuntimeMessage,
} from '@/lib/messaging/runtime/runtimeMessages'

// A content script needs a syntactically valid match pattern, so with no hosted
// API configured this points at a reserved `.invalid` origin that never
// resolves: the script ships but can never run against anyone's site.
const hostedApiOrigin = env.VITE_PUBLIC_BROWSEROS_API || UNCONFIGURED_API_ORIGIN

export default defineContentScript({
  matches: [`${hostedApiOrigin}/home`],
  runAt: 'document_start',
  main() {
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'AUTH_SUCCESS') {
        void sendRuntimeMessage(RuntimeMessageType.authSuccess)
      }
    })
  },
})
