// src/main/handlers/report.handler.ts
import type { DB } from '../database/connection'
import { safeHandle }    from '../utils/safeHandle'
import * as reportService from '../services/reportService'
import * as mailerService from '../mailer/mailerService'
import { CH }            from '@shared/ipcChannels'

export function registerReportHandlers(db: DB): void {
  safeHandle(CH.REPORT_DAILY,       (_e, date: string)                   => reportService.buildDailyReport(db, date))
  safeHandle(CH.REPORT_MONTHLY,     (_e, year: number, month: number)    => reportService.buildMonthlyReport(db, year, month))
  safeHandle(CH.REPORT_INVENTORY,   ()                                   => reportService.buildInventoryReport(db))
  safeHandle(CH.REPORT_PROFIT_LOSS, (_e, from: string, to: string)       => reportService.buildProfitLoss(db, from, to))
  safeHandle(CH.REPORT_XREPORT,     (_e, uid: number)                    => reportService.buildXReport(db, uid))
  safeHandle(CH.REPORT_ZREPORT,     (_e, uid: number)                    => reportService.buildZReport(db, uid))
  safeHandle(CH.REPORT_EMAIL_SEND,  (_e, date?: string)                  => mailerService.sendDailyReportEmail(date))

  // Yearly — FIX: was using require() which breaks in electron-vite bundle.
  // reportService is already imported at the top of this file; use it directly.
  safeHandle('report:yearly', (_e, year: number) => reportService.buildYearlyReport(db, year))
}
