import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Vitest config for NovaPOS main-process logic.
// We mock electron so services that transitively import it can run in Node.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
})
