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

  // Channels that are safe to retry automatically: pure reads.
  // Writes (sales, stock, users…) must NEVER auto-retry — a timed-out
  // sale may have actually committed on the server; retrying would
  // duplicate it. The cashier retries manually after seeing the error.
  private static isReadChannel(channel: string): boolean {
    return /(:getAll|:get$|:search|:history|:status|:findBarcode|:priceHistory|:priceChangeHistory|report:)/.test(channel)
  }

  private static friendly(e: Error, channel: string): string {
    const m = e.message || ''
    if (e.name === 'TimeoutError' || m.includes('timeout') || m.includes('aborted')) {
      return 'The server is responding slowly. Check the server PC and your network cable/Wi-Fi, then try again.'
    }
    if (m.includes('ECONNREFUSED') || m.includes('Failed to fetch') || m.includes('fetch failed')) {
      return 'Cannot reach the server PC. Make sure NovaPOS is running there in Server mode and both machines are on the same network.'
    }
    return `Network error on ${channel}: ${m}`
  }

  private async once(channel: string, args: unknown[], timeoutMs: number) {
    const started = Date.now()
    const response = await fetch(`${this.serverUrl}/rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.secret}`,
      },
      body: JSON.stringify({ channel, args }),
      signal: AbortSignal.timeout(timeoutMs),
    })

    // Surface slowness in logs even when the call eventually succeeds —
    // this is how we notice a degrading network BEFORE users complain.
    const elapsed = Date.now() - started
    if (elapsed > 3_000) logger.warn(`[LAN Client] SLOW response: ${channel} took ${elapsed}ms`)

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }))
      return { success: false as const, error: (err as { error: string }).error }
    }
    return (await response.json()) as { success: boolean; data?: unknown; error?: string }
  }

  async call(channel: string, ...args: unknown[]) {
    const isRead = RemoteAdapter.isReadChannel(channel)
    try {
      // Reads: shorter first attempt (8s) so the UI recovers fast.
      // Writes: single generous attempt (15s), no retry.
      return await this.once(channel, args, isRead ? 8_000 : 15_000)
    } catch (err: unknown) {
      const e = err as Error
      if (isRead) {
        logger.warn(`[LAN Client] Read failed (${channel}): ${e.message} — retrying once`)
        try {
          await new Promise(r => setTimeout(r, 750))
          return await this.once(channel, args, 8_000)
        } catch (err2: unknown) {
          const e2 = err2 as Error
          logger.error(`[LAN Client] Retry failed for ${channel}:`, e2.message)
          return { success: false as const, error: RemoteAdapter.friendly(e2, channel) }
        }
      }
      logger.error(`[LAN Client] Network error for ${channel}:`, e.message)
      return { success: false as const, error: RemoteAdapter.friendly(e, channel) }
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
