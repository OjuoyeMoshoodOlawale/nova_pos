// tests/setup.ts — global test setup
// Mocks Electron so main-process modules can be imported under Node/Vitest.
import { vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) =>
      name === 'userData' ? path.join(os.tmpdir(), 'novapos-test') : os.tmpdir(),
    getVersion: () => '1.0.0-test',
    getName:    () => 'NovaPOS',
  },
  Notification: class { show() {} static isSupported() { return false } },
  dialog: {},
  net:    { isOnline: () => true },
  shell:  {},
}))

