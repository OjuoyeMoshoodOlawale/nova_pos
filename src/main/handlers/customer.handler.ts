// src/main/handlers/customer.handler.ts
import type { DB } from '../database/connection'
import { safeHandle } from '../utils/safeHandle'
import { CH } from '@shared/ipcChannels'

export function registerCustomerHandlers(db: DB): void {
  safeHandle(CH.CUSTOMER_ALL,    () => db.prepare('SELECT * FROM customers WHERE is_active=1 ORDER BY full_name').all())

  safeHandle(CH.CUSTOMER_SEARCH, (_e, q: string) => {
    const like = `%${q}%`
    return db.prepare('SELECT * FROM customers WHERE is_active=1 AND (full_name LIKE ? OR phone LIKE ?) LIMIT 20').all([like, like])
  })

  safeHandle(CH.CUSTOMER_GET,    (_e, id: number) => db.prepare('SELECT * FROM customers WHERE id=?').get([id]))

  safeHandle(CH.CUSTOMER_HISTORY,(_e, id: number) =>
    db.prepare('SELECT * FROM sales WHERE customer_id=? ORDER BY sale_date DESC LIMIT 50').all([id]))

  safeHandle(CH.CUSTOMER_CREATE, (_e, d: { full_name:string; phone?:string; email?:string; address?:string; notes?:string }) => {
    const r = db.prepare('INSERT INTO customers (full_name, phone, email, address, notes) VALUES (?, ?, ?, ?, ?)')
      .run([d.full_name, d.phone??null, d.email??null, d.address??null, d.notes??null])
    return db.prepare('SELECT * FROM customers WHERE id=?').get([Number(r.lastInsertRowid)])
  })

  safeHandle(CH.CUSTOMER_UPDATE, (_e, id: number, d: { full_name:string; phone?:string; email?:string; address?:string; notes?:string }) => {
    db.prepare(`UPDATE customers SET full_name=?, phone=?, email=?, address=?, notes=?, updated_at=datetime('now') WHERE id=?`)
      .run([d.full_name, d.phone??null, d.email??null, d.address??null, d.notes??null, id])
    return db.prepare('SELECT * FROM customers WHERE id=?').get([id])
  })

  safeHandle(CH.CUSTOMER_ARCHIVE,(_e, id: number) =>
    db.prepare('UPDATE customers SET is_active=0 WHERE id=?').run([id]))
}
