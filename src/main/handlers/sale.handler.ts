// src/main/handlers/sale.handler.ts
import type { DB } from '../database/connection'
import { safeHandle } from '../utils/safeHandle'
import * as saleService from '../services/saleService'
import { CH } from '@shared/ipcChannels'

export function registerSaleHandlers(db: DB): void {
  safeHandle(CH.SALE_COMPLETE,     (_e, input)      => saleService.completeSale(db, input))
  safeHandle(CH.SALE_VOID,         (_e, id, reason, uid) => saleService.voidSale(db, id, reason, uid))
  safeHandle(CH.SALE_HOLD,         (_e, cart, label, custId, uid) => saleService.holdSale(db, cart, label, custId, uid))
  safeHandle(CH.SALE_GET_HELD,     ()               => saleService.getHeldOrders(db))
  safeHandle(CH.SALE_RELEASE_HELD, (_e, id: number) => saleService.releaseHeldOrder(db, id))
  safeHandle(CH.SALE_ALL,          (_e, filters)    => saleService.getSales(db, filters))
  safeHandle(CH.SALE_GET,          (_e, id: number) => saleService.getSaleById(db, id))
}
