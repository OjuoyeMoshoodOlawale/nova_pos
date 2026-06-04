import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('shared'),
        '@main':   resolve('src/main'),
      },
    },
    define: {
      __DEV_SECRET__: JSON.stringify(
        process.env.NOVA_DEV_SECRET ?? 'nova-default-dev-secret-v1-CHANGE-ME'
      ),
    },
  },

  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('shared'),
      },
    },
  },

  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared':   resolve('shared'),
        '@':         resolve('src/renderer/src'),
      },
    },
    define: {
      __DEV_SECRET__: JSON.stringify(''),
    },
    plugins: [react()],
    // PostCSS (Tailwind + Autoprefixer) is picked up automatically
    // from postcss.config.js — no need to configure it here
  },
})
