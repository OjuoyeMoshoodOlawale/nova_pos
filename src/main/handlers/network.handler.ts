// src/main/handlers/network.handler.ts
import type { DB } from '../database/connection'
import { safeHandle } from '../utils/safeHandle'
import { getSetting, setSetting } from '../services/settingsService'
import { startLanServer, stopLanServer, getLanServerInfo } from '../network/lanServer'
import { CH } from '@shared/ipcChannels'

export function registerNetworkHandlers(db: DB): void {
  safeHandle(CH.NETWORK_SERVER_INFO, () => getLanServerInfo())

  safeHandle(CH.NETWORK_START_SERVER, async (_e, port: number, secret: string) => {
    setSetting(db, 'network_mode', 'server')
    setSetting(db, 'lan_server_port', String(port))
    setSetting(db, 'lan_secret', secret)
    await startLanServer(port, secret)
    return getLanServerInfo()
  })

  safeHandle(CH.NETWORK_STOP_SERVER, async () => {
    setSetting(db, 'network_mode', 'standalone')
    await stopLanServer()
  })
}
