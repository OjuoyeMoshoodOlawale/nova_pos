// src/main/handlers/index.ts
import type { DB } from '../database/connection'
import { registerActivationHandlers } from './activation.handler'
import { registerAuthHandlers }       from './auth.handler'
import { registerSettingsHandlers }   from './settings.handler'
import { registerProductHandlers }    from './product.handler'
import { registerCategoryHandlers }   from './category.handler'
import { registerCustomerHandlers }   from './customer.handler'
import { registerSupplierHandlers }   from './supplier.handler'
import { registerSaleHandlers }       from './sale.handler'
import { registerInventoryHandlers }  from './inventory.handler'
import { registerStaffHandlers }      from './staff.handler'
import { registerReportHandlers }     from './report.handler'
import { registerHardwareHandlers }   from './hardware.handler'
import { registerNetworkHandlers }    from './network.handler'
import logger from '../utils/logger'

export function registerAllHandlers(db: DB): void {
  logger.info('[Handlers] Registering all IPC handlers...')

  registerActivationHandlers(db)
  registerAuthHandlers(db)
  registerSettingsHandlers(db)
  registerProductHandlers(db)
  registerCategoryHandlers(db)
  registerCustomerHandlers(db)
  registerSupplierHandlers(db)
  registerSaleHandlers(db)
  registerInventoryHandlers(db)
  registerStaffHandlers(db)
  registerReportHandlers(db)
  registerHardwareHandlers(db)
  registerNetworkHandlers(db)

  logger.info('[Handlers] All IPC handlers registered')
}
