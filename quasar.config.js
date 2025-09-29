/* eslint-env node */

import { configure } from 'quasar/wrappers'
import path from 'path'
import { fileURLToPath } from 'url'
import legacy from '@vitejs/plugin-legacy'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PUBLIC_PATH = process.env.PUBLIC_PATH || '/creator-hub/'

export default configure(() => ({
  // 1. 'node-globals' boot file is removed. This is correct.
  boot: ['welcomeGate', 'cashu', 'i18n', 'notify', 'nostr-provider'],

  css: ['app.scss', 'base.scss', 'buckets.scss'],
  extras: ['roboto-font', 'material-icons'],
  build: {
    target: { browser: ['es2019'] },
    sourcemap: true,
    publicPath: PUBLIC_PATH,
    vueRouterMode: 'history',
    extendViteConf (viteConf) {
      viteConf.resolve = viteConf.resolve || {}
      viteConf.resolve.alias = {
        ...(viteConf.resolve.alias || {}),
        // 2. We DO NOT need aliases for buffer or process. The plugin handles this.
        '@': path.resolve(__dirname, 'src'),
        '@cashu/cashu-ts': path.resolve(
          __dirname,
          'src/lib/cashu-ts/src/index.ts'
        ),
      }
      viteConf.plugins = (viteConf.plugins || []).concat([
        legacy({
          targets: ['defaults', 'not IE 11', 'Safari >= 13'],
          modernPolyfills: true
        }),
        // 3. This is the correct, complete configuration for the polyfill plugin.
        // It makes Buffer and process available to modules that import them
        // without dangerously injecting them into the global 'window' object.
        nodePolyfills({
          // To exclude specific polyfills, add them to this list.
          exclude: [],
          // Whether to polyfill `global`.
          globals: {
            Buffer: true, // Provide a Buffer global
            global: true,
            process: true, // Provide a process global
          },
          // Whether to polyfill `node:` protocol imports.
          protocolImports: true,
        })
      ])
    }
  },
  framework: {
    config: {
      dark: true
    },
    plugins: ['Notify', 'LocalStorage']
  },
  pwa: {
    workboxMode: 'generateSW',
    manifest: {
      scope: PUBLIC_PATH,
      start_url: PUBLIC_PATH
    },
    extendGenerateSW (cfg) {
      cfg.skipWaiting = true
      cfg.clientsClaim = true
      cfg.cleanupOutdatedCaches = true
    }
  }
}))
