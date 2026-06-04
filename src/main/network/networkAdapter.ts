// src/main/network/networkAdapter.ts
// ─────────────────────────────────────────────────────────
// The NetworkAdapter abstracts WHERE data comes from.
// In standalone/server mode: calls local service functions.
// In client mode: forwards calls to the LAN server over HTTP.
//
// IPC handlers always use the adapter — they never call
// services directly. This makes LAN transparent.
// ─────────────────────────────────────────────────────────

import logger from '../utils/logger'

export type ServiceFn = (...args: unknown[]) => unknown

export interface IAdapter {
  call(channel: string, ...args: unknown[]): Promise<{ success: boolean; data?: unknown; error?: string }>
}

// ─── LOCAL ADAPTER ───────────────────────────────────────

export class LocalAdapter implements IAdapter {
  private registry = new Map<string, ServiceFn>()

  register(channel: string, fn: ServiceFn): void {
    this.registry.set(channel, fn)
  }

  async call(channel: string, ...args: unknown[]) {
    const fn = this.registry.get(channel)
    if (!fn) return { success: false as const, error: `No local handler for: ${channel}` }
    try {
      const data = await fn(...args)
      return { success: true as const, data: data ?? null }
    } catch (err: unknown) {
      const e = err as Error
      return { success: false as const, error: e.message }
    }
  }
}

// ─── REMOTE ADAPTER (LAN CLIENT) ─────────────────────────

export class RemoteAdapter implements IAdapter {
  constructor(private serverUrl: string, private secret: string) {}

  async call(channel: string, ...args: unknown[]) {
    try {
      const response = await fetch(`${this.serverUrl}/rpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.secret}`,
        },
        body: JSON.stringify({ channel, args }),
        signal: AbortSignal.timeout(15_000), // 15s timeout
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText }))
        return { success: false as const, error: (err as { error: string }).error }
      }

      return (await response.json()) as { success: boolean; data?: unknown; error?: string }
    } catch (err: unknown) {
      const e = err as Error
      logger.error(`[LAN Client] Network error for ${channel}:`, e.message)
      return { success: false as const, error: `Network error: ${e.message}` }
    }
  }
}

// ─── SINGLETON ───────────────────────────────────────────

let _adapter: IAdapter | null = null

export function initAdapter(mode: 'standalone' | 'server' | 'client', options?: {
  serverUrl?: string
  secret?: string
}): void {
  if (mode === 'client' && options?.serverUrl) {
    _adapter = new RemoteAdapter(options.serverUrl, options.secret ?? '')
    logger.info(`[Network] Client mode — server: ${options.serverUrl}`)
  } else {
    _adapter = new LocalAdapter()
    logger.info(`[Network] ${mode === 'server' ? 'Server' : 'Standalone'} mode — using local DB`)
  }
}

export function getAdapter(): IAdapter {
  if (!_adapter) {
    // Default to local if not initialised yet
    _adapter = new LocalAdapter()
  }
  return _adapter
}

export function registerLocalService(channel: string, fn: ServiceFn): void {
  const adapter = getAdapter()
  if (adapter instanceof LocalAdapter) {
    adapter.register(channel, fn)
  }
}
