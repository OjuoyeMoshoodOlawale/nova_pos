// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'
import { CH } from '@shared/ipcChannels'

const invoke = (channel: string, ...args: unknown[]) =>
  ipcRenderer.invoke(channel, ...args)

const api = {
  // ── Activation ─────────────────────────────────────────
  activation: {
    getStatus:    ()                          => invoke(CH.ACTIVATION_STATUS),
    getMachineId: ()                          => invoke(CH.ACTIVATION_MACHINE),
    activate:     (key: string, biz: string) => invoke(CH.ACTIVATION_ACTIVATE, key, biz),
  },

  // ── Auth ───────────────────────────────────────────────
  auth: {
    login:          (u: string, p: string)              => invoke(CH.AUTH_LOGIN, u, p),
    logout:         (token: string)                     => invoke(CH.AUTH_LOGOUT, token),
    me:             (token: string)                     => invoke(CH.AUTH_ME, token),
    changePassword: (uid: number, o: string, n: string) => invoke(CH.AUTH_CHANGE_PASS, uid, o, n),
  },

  // ── Profile ────────────────────────────────────────────
  profile: {
    get:  ()           => invoke(CH.PROFILE_GET),
    save: (d: unknown) => invoke(CH.PROFILE_SAVE, d),
  },

  // ── Settings ───────────────────────────────────────────
  settings: {
    getAll:        ()                          => invoke(CH.SETTINGS_GET),
    set:           (k: string, v: string)      => invoke(CH.SETTINGS_SET, k, v),
    testEmail:     (cfg: unknown)              => invoke(CH.SETTINGS_TEST_EMAIL, cfg),
    listPrinters:  ()                          => invoke(CH.SETTINGS_LIST_PRINTERS),
    backup:        ()                          => invoke(CH.SETTINGS_BACKUP),
    restore:       ()                          => invoke(CH.SETTINGS_RESTORE),
    backupNow:     ()                          => invoke('settings:backupNow'),

    // ── Backup (local + Google Drive) ──────────────────
    // Returns actual runtime paths (userData dir, DB path, default backup dir)
    getAppPaths:   ()                          => invoke('settings:getAppPaths'),
    // Opens a native OS folder-picker dialog
    chooseFolder:  ()                          => invoke('settings:chooseFolder'),
    // Opens a folder in Windows Explorer / macOS Finder
    openFolder:    (folderPath: string)        => invoke('settings:openFolder', folderPath),
    // Copies DB to timestamped file in backupDir; optionally mirrors to gdriveDir
    // backupDir is system-fixed; users only configure the GDrive sync folder
    backupLocal:   (opts: { gdriveDir?: string } = {}) =>
                                                  invoke('settings:backupLocal', opts),
  },

  // ── Network ────────────────────────────────────────────
  network: {
    getServerInfo: ()                              => invoke(CH.NETWORK_SERVER_INFO),
    startServer:   (port: number, secret: string)  => invoke(CH.NETWORK_START_SERVER, port, secret),
    stopServer:    ()                              => invoke(CH.NETWORK_STOP_SERVER),
  },

  // ── Categories ─────────────────────────────────────────
  categories: {
    getAll:  ()                           => invoke(CH.CATEGORY_ALL),
    create:  (d: unknown)                 => invoke(CH.CATEGORY_CREATE, d),
    update:  (id: number, d: unknown)     => invoke(CH.CATEGORY_UPDATE, id, d),
    delete:  (id: number)                 => invoke(CH.CATEGORY_DELETE, id),
  },

  // ── Products ───────────────────────────────────────────
  products: {
    getAll:             ()                          => invoke(CH.PRODUCT_ALL),
    search:             (q: string)                 => invoke(CH.PRODUCT_SEARCH, q),
    findBarcode:        (b: string)                 => invoke(CH.PRODUCT_BARCODE, b),
    getById:            (id: number)                => invoke(CH.PRODUCT_GET, id),
    create:             (d: unknown)                => invoke(CH.PRODUCT_CREATE, d),
    update:             (id: number, d: unknown)    => invoke(CH.PRODUCT_UPDATE, id, d),
    archive:            (id: number)                => invoke(CH.PRODUCT_ARCHIVE, id),
    getLowStock:        ()                          => invoke(CH.PRODUCT_LOW_STOCK),
    bulkImport:         (rows: unknown[], uid: number) => invoke(CH.PRODUCT_BULK_IMPORT, rows, uid),
    receiveStock:       (input: unknown)            => invoke('products:receiveStock', input),
    priceHistory:       (id: number)                => invoke('products:priceHistory', id),
    priceChangeHistory: (id: number)                => invoke('products:priceChangeHistory', id),
  },

  // ── Customers ──────────────────────────────────────────
  customers: {
    getAll:   ()                           => invoke(CH.CUSTOMER_ALL),
    search:   (q: string)                  => invoke(CH.CUSTOMER_SEARCH, q),
    getById:  (id: number)                 => invoke(CH.CUSTOMER_GET, id),
    history:  (id: number)                 => invoke(CH.CUSTOMER_HISTORY, id),
    create:   (d: unknown)                 => invoke(CH.CUSTOMER_CREATE, d),
    update:   (id: number, d: unknown)     => invoke(CH.CUSTOMER_UPDATE, id, d),
    archive:  (id: number)                 => invoke(CH.CUSTOMER_ARCHIVE, id),
  },

  // ── Suppliers ──────────────────────────────────────────
  suppliers: {
    getAll:  ()                         => invoke(CH.SUPPLIER_ALL),
    create:  (d: unknown)               => invoke(CH.SUPPLIER_CREATE, d),
    update:  (id: number, d: unknown)   => invoke(CH.SUPPLIER_UPDATE, id, d),
    archive: (id: number)               => invoke(CH.SUPPLIER_ARCHIVE, id),
  },

  // ── Sales ──────────────────────────────────────────────
  sales: {
    complete:    (input: unknown)                             => invoke(CH.SALE_COMPLETE, input),
    void:        (id: number, reason: string, uid: number)   => invoke(CH.SALE_VOID, id, reason, uid),
    hold:        (cart: string, label: string | null, custId: number | null, uid: number) =>
                                                                invoke(CH.SALE_HOLD, cart, label, custId, uid),
    getHeld:     ()                                          => invoke(CH.SALE_GET_HELD),
    releaseHeld: (id: number)                                => invoke(CH.SALE_RELEASE_HELD, id),
    getAll:      (filters: unknown)                          => invoke(CH.SALE_ALL, filters),
    getById:     (id: number)                                => invoke(CH.SALE_GET, id),
  },

  // ── Inventory ──────────────────────────────────────────
  inventory: {
    adjust:     (dto: unknown)                    => invoke(CH.INVENTORY_ADJUST, dto),
    history:    (productId?: number)              => invoke(CH.INVENTORY_HISTORY, productId),
    setOpening: (items: unknown[], uid: number)   => invoke(CH.INVENTORY_OPENING, items, uid),
  },

  // ── Staff ──────────────────────────────────────────────
  staff: {
    getAll:     ()                          => invoke(CH.STAFF_ALL),
    create:     (d: unknown)                => invoke(CH.STAFF_CREATE, d),
    update:     (id: number, d: unknown)    => invoke(CH.STAFF_UPDATE, id, d),
    deactivate: (id: number)                => invoke(CH.STAFF_DEACTIVATE, id),
  },

  // ── Reports ────────────────────────────────────────────
  reports: {
    daily:      (date: string)                => invoke(CH.REPORT_DAILY, date),
    monthly:    (year: number, month: number) => invoke(CH.REPORT_MONTHLY, year, month),
    yearly:     (year: number)                => invoke('report:yearly', year),
    inventory:  ()                            => invoke(CH.REPORT_INVENTORY),
    profitLoss: (from: string, to: string)    => invoke(CH.REPORT_PROFIT_LOSS, from, to),
    xReport:    (uid: number)                 => invoke(CH.REPORT_XREPORT, uid),
    zReport:    (uid: number)                 => invoke(CH.REPORT_ZREPORT, uid),
    emailSend:  (date?: string)               => invoke(CH.REPORT_EMAIL_SEND, date),
  },

  // ── Hardware ───────────────────────────────────────────
  hardware: {
    listPrinters: ()               => invoke(CH.HARDWARE_PRINTERS),
    print:        (d: unknown)     => invoke(CH.HARDWARE_PRINT, d),
    testPrint:    ()               => invoke(CH.HARDWARE_TEST_PRINT),
    printSale:    (saleId: number) => invoke(CH.HARDWARE_PRINT, { saleId }),
  },
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronApi = typeof api
declare global {
  interface Window { api: ElectronApi }
}
