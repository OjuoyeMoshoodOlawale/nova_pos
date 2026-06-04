// src/main/index.ts
import { app, BrowserWindow, Menu, shell } from 'electron'
import { join }  from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { getDb }              from './database/connection'
import { runMigrations }      from './database/migrate'
import { registerAllHandlers } from './handlers/index'
import { getSetting }          from './services/settingsService'
import { getActivationStatus } from './services/activationService'
import { initAdapter }         from './network/networkAdapter'
import { startLanServer }      from './network/lanServer'
import { startSchedulers }     from './mailer/mailerService'
import logger                  from './utils/logger'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width:  1280,
    height: 800,
    minWidth:  1024,
    minHeight: 680,
    show: false,
    frame: true,
    backgroundColor: '#0f172a',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Graceful show
  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // Open external links in the OS browser, not Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // ── Production security lockdown ───────────────────────
  if (app.isPackaged) {
    mainWindow.webContents.on('context-menu', (e) => e.preventDefault())
    mainWindow.webContents.on('before-input-event', (_e, input) => {
      // Block F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+R
      const blockedKeys = ['F12']
      const blockedCombos = [
        { ctrl: true, shift: true, key: 'I' },
        { ctrl: true, shift: true, key: 'J' },
        { ctrl: true,              key: 'R' },
      ]
      if (blockedKeys.includes(input.key)) mainWindow?.webContents.closeDevTools()
      for (const c of blockedCombos) {
        if (c.ctrl === input.control && (!c.shift || c.shift === input.shift) && c.key === input.key) {
          mainWindow?.webContents.closeDevTools()
        }
      }
    })
    Menu.setApplicationMenu(buildProductionMenu())
  }

  // Load the app
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function buildProductionMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [{ label: 'Exit', role: 'quit' }],
    },
    {
      label: 'Help',
      submenu: [{ label: 'About NovaPOS', click: () => showAbout() }],
    },
  ])
}

function showAbout(): void {
  const { dialog } = require('electron')
  dialog.showMessageBox({
    type: 'info',
    title: 'About NovaPOS',
    message: 'NovaPOS',
    detail: `Version ${app.getVersion()}\nDesktop Point of Sale Application\n\nFor support contact your vendor.`,
  })
}

// ─── BOOT SEQUENCE ────────────────────────────────────────

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.novapos.desktop')

  // Prevent multiple instances
  if (!app.requestSingleInstanceLock()) {
    logger.warn('Another instance is already running — quitting')
    app.quit()
    return
  }

  app.on('second-instance', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })

  logger.info(`[Boot] NovaPOS ${app.getVersion()} starting`)

  // ── 1. Database setup ───────────────────────────────────
  const db = getDb()
  runMigrations(db)
  logger.info('[Boot] Database ready')

  // ── 2. Network adapter init ─────────────────────────────
  const networkMode = getSetting(db, 'network_mode') as 'standalone' | 'server' | 'client'
  if (networkMode === 'client') {
    const ip     = getSetting(db, 'lan_server_ip')
    const port   = getSetting(db, 'lan_server_port') || '3977'
    const secret = getSetting(db, 'lan_secret')
    initAdapter('client', { serverUrl: `http://${ip}:${port}`, secret })
  } else {
    initAdapter(networkMode || 'standalone')
    if (networkMode === 'server') {
      const port   = parseInt(getSetting(db, 'lan_server_port') || '3977')
      const secret = getSetting(db, 'lan_secret') || ''
      await startLanServer(port, secret).catch((e) =>
        logger.error('[Boot] LAN server failed to start:', e.message)
      )
    }
  }

  // ── 3. IPC handlers ─────────────────────────────────────
  registerAllHandlers(db)

  // ── 4. Schedulers (email reports + backup) ───────────────
  const setupDone = getSetting(db, 'setup_complete') === 'true'
  if (setupDone) {
    startSchedulers()
    logger.info('[Boot] Schedulers started')
  }

  // ── 5. Open main window ─────────────────────────────────
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
