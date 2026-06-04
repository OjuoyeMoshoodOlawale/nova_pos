// src/main/utils/logger.ts
import log from 'electron-log'
import { app } from 'electron'
import path from 'node:path'

// Persist logs to userData/logs/
log.transports.file.resolvePathFn = () =>
  path.join(app.getPath('userData'), 'logs', 'novapos.log')
log.transports.file.maxSize = 5 * 1024 * 1024 // 5 MB per file
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}'
log.transports.console.format = '[NovaPOS] [{level}] {text}'

// Only show debug in development
if (app.isPackaged) {
  log.transports.console.level = 'warn'
} else {
  log.transports.console.level = 'debug'
}

export default log
