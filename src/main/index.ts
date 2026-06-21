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

let mainWindow:   BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null

// ── Splash / launch loader ────────────────────────────────
// Small frameless window with the product icon and branding,
// shown instantly while the main window loads in background.
function createSplash(): void {
  splashWindow = new BrowserWindow({
    width: 360, height: 420,
    frame: false, transparent: false, resizable: false,
    alwaysOnTop: true, skipTaskbar: true, center: true,
    backgroundColor: '#0f172a',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: { sandbox: true },
  })
  // Inline HTML — no extra file to bundle, cannot 404
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{height:100vh;display:flex;flex-direction:column;align-items:center;
      justify-content:center;background:linear-gradient(160deg,#0f172a,#1e293b);
      font-family:Segoe UI,Arial,sans-serif;color:#e2e8f0;gap:18px;
      -webkit-user-select:none;cursor:default}
    .logo{width:96px;height:96px;border-radius:24px;
      background:linear-gradient(135deg,#2563eb,#06b6d4);
      display:flex;align-items:center;justify-content:center;
      font-size:44px;font-weight:800;color:#fff;
      box-shadow:0 12px 40px rgba(37,99,235,.45);animation:pulse 1.6s ease-in-out infinite}
    @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
    h1{font-size:24px;font-weight:700;letter-spacing:.5px}
    .bar{width:200px;height:4px;border-radius:99px;background:#1e293b;overflow:hidden}
    .bar i{display:block;height:100%;width:35%;border-radius:99px;
      background:linear-gradient(90deg,#2563eb,#06b6d4);animation:slide 1.2s ease-in-out infinite}
    @keyframes slide{0%{margin-left:-35%}100%{margin-left:100%}}
    .powered{position:absolute;bottom:22px;font-size:11px;color:#64748b}
    .powered b{color:#94a3b8}
  </style></head><body>
    <div class="logo">N</div>
    <h1>NovaPOS</h1>
    <div class="bar"><i></i></div>
    <div class="powered">Powered by <b>Webautomate Nigeria</b></div>
  </body></html>`
  splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  splashWindow.on('closed', () => { splashWindow = null })
}

function closeSplash(): void {
  try { splashWindow?.close() } catch { /* already closed */ }
  splashWindow = null
}

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
  mainWindow.on('ready-to-show', () => {
    closeSplash()          // hand over from splash to the app
    mainWindow?.show()
  })

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

  // ── 0. Splash — instant visual feedback while we boot ───
  createSplash()

  // ── 1. Database setup (fast on subsequent runs) ─────────
  const db = getDb()
  runMigrations(db)
  logger.info('[Boot] Database ready')

  // ── 2. IPC handlers (must be ready before renderer calls them)
  registerAllHandlers(db)

  // ── 3. Open main window ASAP ────────────────────────────
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  // ── 4. DEFERRED: start heavy services AFTER window shows ─
  // These don't need to be ready before the UI — they run in the background.
  mainWindow?.on('ready-to-show', () => {
    // Network adapter + LAN server (fire and forget — don't block)
    try {
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
          startLanServer(port, secret).catch(e =>
            logger.error('[Boot] LAN server failed:', e.message)
          )
        }
      }
    } catch (e) { logger.error('[Boot] Network init error:', e) }

    // Schedulers (email reports + backup)
    const setupDone = getSetting(db, 'setup_complete') === 'true'
    if (setupDone) {
      startSchedulers()
      logger.info('[Boot] Schedulers started (deferred)')
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
