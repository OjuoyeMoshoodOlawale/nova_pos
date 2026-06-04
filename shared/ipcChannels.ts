// shared/ipcChannels.ts
// ─────────────────────────────────────────────────────────
// Typed constants for every IPC channel.
// Import in both handlers (main) and hooks (renderer) to
// eliminate magic strings and prevent typos.
// ─────────────────────────────────────────────────────────

export const CH = {
  // Activation
  ACTIVATION_STATUS:   'activation:status',
  ACTIVATION_ACTIVATE: 'activation:activate',
  ACTIVATION_MACHINE:  'activation:machineId',

  // Auth
  AUTH_LOGIN:          'auth:login',
  AUTH_LOGOUT:         'auth:logout',
  AUTH_ME:             'auth:me',
  AUTH_CHANGE_PASS:    'auth:changePassword',
  AUTH_DEV_LOGIN:      'auth:devLogin',

  // Business Profile
  PROFILE_GET:         'profile:get',
  PROFILE_SAVE:        'profile:save',

  // Settings
  SETTINGS_GET:        'settings:get',
  SETTINGS_SET:        'settings:set',
  SETTINGS_TEST_EMAIL: 'settings:testEmail',
  SETTINGS_TEST_PRINT: 'settings:testPrint',
  SETTINGS_LIST_PRINTERS: 'settings:listPrinters',
  SETTINGS_BACKUP:     'settings:backup',
  SETTINGS_RESTORE:    'settings:restore',

  // Network / LAN
  NETWORK_SCAN:        'network:scan',
  NETWORK_START_SERVER:'network:startServer',
  NETWORK_STOP_SERVER: 'network:stopServer',
  NETWORK_SERVER_INFO: 'network:serverInfo',

  // Categories
  CATEGORY_ALL:        'category:all',
  CATEGORY_CREATE:     'category:create',
  CATEGORY_UPDATE:     'category:update',
  CATEGORY_DELETE:     'category:delete',

  // Products
  PRODUCT_ALL:         'product:all',
  PRODUCT_SEARCH:      'product:search',
  PRODUCT_BARCODE:     'product:findByBarcode',
  PRODUCT_GET:         'product:getById',
  PRODUCT_CREATE:      'product:create',
  PRODUCT_UPDATE:      'product:update',
  PRODUCT_ARCHIVE:     'product:archive',
  PRODUCT_BULK_IMPORT: 'product:bulkImport',
  PRODUCT_LOW_STOCK:   'product:lowStock',

  // Customers
  CUSTOMER_ALL:        'customer:all',
  CUSTOMER_SEARCH:     'customer:search',
  CUSTOMER_GET:        'customer:getById',
  CUSTOMER_CREATE:     'customer:create',
  CUSTOMER_UPDATE:     'customer:update',
  CUSTOMER_HISTORY:    'customer:history',
  CUSTOMER_ARCHIVE:    'customer:archive',

  // Suppliers
  SUPPLIER_ALL:        'supplier:all',
  SUPPLIER_CREATE:     'supplier:create',
  SUPPLIER_UPDATE:     'supplier:update',
  SUPPLIER_ARCHIVE:    'supplier:archive',

  // Sales
  SALE_COMPLETE:       'sale:complete',
  SALE_VOID:           'sale:void',
  SALE_HOLD:           'sale:hold',
  SALE_GET_HELD:       'sale:getHeld',
  SALE_RELEASE_HELD:   'sale:releaseHeld',
  SALE_ALL:            'sale:all',
  SALE_GET:            'sale:getById',
  SALE_REPRINT:        'sale:reprint',

  // Inventory
  INVENTORY_ADJUST:    'inventory:adjust',
  INVENTORY_HISTORY:   'inventory:history',
  INVENTORY_OPENING:   'inventory:setOpeningStock',  // setup wizard step

  // Purchase Orders
  PO_ALL:              'po:all',
  PO_GET:              'po:getById',
  PO_CREATE:           'po:create',
  PO_RECEIVE:          'po:receive',
  PO_CANCEL:           'po:cancel',

  // Staff
  STAFF_ALL:           'staff:all',
  STAFF_CREATE:        'staff:create',
  STAFF_UPDATE:        'staff:update',
  STAFF_DEACTIVATE:    'staff:deactivate',

  // Reports
  REPORT_DAILY:        'report:daily',
  REPORT_WEEKLY:       'report:weekly',
  REPORT_MONTHLY:      'report:monthly',
  REPORT_INVENTORY:    'report:inventory',
  REPORT_PROFIT_LOSS:  'report:profitLoss',
  REPORT_EMAIL_SEND:   'report:emailSend',
  REPORT_XREPORT:      'report:xReport',
  REPORT_ZREPORT:      'report:zReport',

  // Hardware
  HARDWARE_PRINT:      'hardware:printReceipt',
  HARDWARE_PRINTERS:   'hardware:listPrinters',
  HARDWARE_TEST_PRINT: 'hardware:testPrint',

  // Activity Log
  LOG_ALL:             'log:all',
} as const

export type IpcChannel = typeof CH[keyof typeof CH]
