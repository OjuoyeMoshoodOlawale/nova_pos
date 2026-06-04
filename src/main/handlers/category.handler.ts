// src/main/handlers/category.handler.ts
import type { DB } from '../database/connection'
import { safeHandle } from '../utils/safeHandle'
import { CH } from '@shared/ipcChannels'

export function registerCategoryHandlers(db: DB): void {
  safeHandle(CH.CATEGORY_ALL,    () => db.prepare('SELECT * FROM categories WHERE is_active=1 ORDER BY name').all())

  safeHandle(CH.CATEGORY_CREATE, (_e, d: { name:string; color:string; icon:string|null }) => {
    const r = db.prepare('INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)').run([d.name, d.color, d.icon ?? null])
    return db.prepare('SELECT * FROM categories WHERE id = ?').get([Number(r.lastInsertRowid)])
  })

  safeHandle(CH.CATEGORY_UPDATE, (_e, id: number, d: { name:string; color:string; icon:string|null }) => {
    db.prepare('UPDATE categories SET name=?, color=?, icon=? WHERE id=?').run([d.name, d.color, d.icon ?? null, id])
    return db.prepare('SELECT * FROM categories WHERE id=?').get([id])
  })

  safeHandle(CH.CATEGORY_DELETE, (_e, id: number) =>
    db.prepare('UPDATE categories SET is_active=0 WHERE id=?').run([id]))
}
