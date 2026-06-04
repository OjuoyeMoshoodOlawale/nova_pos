// src/main/handlers/supplier.handler.ts
import type { DB } from '../database/connection'
import { safeHandle } from '../utils/safeHandle'
import { CH } from '@shared/ipcChannels'

export function registerSupplierHandlers(db: DB): void {
  safeHandle(CH.SUPPLIER_ALL,    () => db.prepare('SELECT * FROM suppliers WHERE is_active=1 ORDER BY name').all())

  safeHandle(CH.SUPPLIER_CREATE, (_e, d: { name:string; contact?:string; phone?:string; email?:string; address?:string; notes?:string }) => {
    const r = db.prepare('INSERT INTO suppliers (name, contact, phone, email, address, notes) VALUES (?, ?, ?, ?, ?, ?)')
      .run([d.name, d.contact??null, d.phone??null, d.email??null, d.address??null, d.notes??null])
    return db.prepare('SELECT * FROM suppliers WHERE id=?').get([Number(r.lastInsertRowid)])
  })

  safeHandle(CH.SUPPLIER_UPDATE, (_e, id: number, d: { name:string; contact?:string; phone?:string; email?:string; address?:string; notes?:string }) => {
    db.prepare('UPDATE suppliers SET name=?, contact=?, phone=?, email=?, address=?, notes=?, updated_at=datetime("now") WHERE id=?')
      .run([d.name, d.contact??null, d.phone??null, d.email??null, d.address??null, d.notes??null, id])
    return db.prepare('SELECT * FROM suppliers WHERE id=?').get([id])
  })

  safeHandle(CH.SUPPLIER_ARCHIVE,(_e, id: number) =>
    db.prepare('UPDATE suppliers SET is_active=0 WHERE id=?').run([id]))
}
