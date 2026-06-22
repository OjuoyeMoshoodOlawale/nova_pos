// Makes `window.api` (exposed by the preload via contextBridge) visible and
// fully typed to the renderer's TypeScript project. The actual shape lives in
// the preload (`ElectronApi = typeof api`); we re-use it here so the renderer
// and preload can never drift out of sync.
import type { ElectronApi } from '../../preload'

declare global {
  interface Window {
    api: ElectronApi
  }
}

export {}
