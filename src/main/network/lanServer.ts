// src/main/network/lanServer.ts
// ─────────────────────────────────────────────────────────
// When network_mode = 'server', starts an Express HTTP server
// on the LAN. Client machines call POST /rpc with:
//   { channel: 'products:getAll', args: [] }
// The server validates the shared LAN secret and routes the
// call to the same service functions used locally.
// ─────────────────────────────────────────────────────────

import express, { Request, Response, NextFunction } from 'express'
import http from 'node:http'
import os from 'node:os'
import logger from '../utils/logger'

type RpcHandler = (args: unknown[]) => Promise<unknown>

const handlers = new Map<string, RpcHandler>()
let httpServer: http.Server | null = null
let _port = 3977
let _secret = ''

/**
 * Register a callable RPC handler (used by networkAdapter).
 */
export function registerRpcHandler(channel: string, fn: RpcHandler): void {
  handlers.set(channel, fn)
}

/**
 * Start the LAN RPC server.
 */
export function startLanServer(port: number, secret: string): Promise<void> {
  _port = port
  _secret = secret

  return new Promise((resolve, reject) => {
    if (httpServer?.listening) {
      logger.info('[LAN Server] Already running')
      return resolve()
    }

    const app = express()
    app.use(express.json({ limit: '10mb' }))

    // Auth middleware
    app.use((req: Request, res: Response, next: NextFunction) => {
      const auth = req.headers['authorization']
      if (!auth || auth !== `Bearer ${_secret}`) {
        res.status(401).json({ success: false, error: 'Unauthorized' })
        return
      }
      next()
    })

    // Health check
    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', time: new Date().toISOString() })
    })

    // RPC endpoint
    app.post('/rpc', async (req: Request, res: Response) => {
      const { channel, args = [] } = req.body as { channel: string; args: unknown[] }
      const handler = handlers.get(channel)
      if (!handler) {
        res.status(404).json({ success: false, error: `Unknown channel: ${channel}` })
        return
      }
      try {
        const data = await handler(args)
        res.json({ success: true, data })
      } catch (err: unknown) {
        const e = err as Error
        logger.error(`[LAN Server] RPC error [${channel}]:`, e.message)
        res.status(500).json({ success: false, error: e.message })
      }
    })

    httpServer = http.createServer(app)
    httpServer.listen(port, '0.0.0.0', () => {
      logger.info(`[LAN Server] Started on port ${port}`)
      resolve()
    })
    httpServer.on('error', reject)
  })
}

export function stopLanServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!httpServer) return resolve()
    httpServer.close(() => {
      httpServer = null
      logger.info('[LAN Server] Stopped')
      resolve()
    })
  })
}

export function getLanServerInfo(): { ip: string; port: number; hostname: string } | null {
  if (!httpServer?.listening) return null
  const ifaces = os.networkInterfaces()
  let ip = '127.0.0.1'
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ip = iface.address
        break
      }
    }
  }
  return { ip, port: _port, hostname: os.hostname() }
}
