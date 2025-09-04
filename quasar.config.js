/* eslint-env node */

import { configure } from 'quasar/wrappers'
import path from 'path'
import { fileURLToPath } from 'url'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default configure(() => ({
  // The conflicting 'node-globals' has been REMOVED from this list.
  boot: ['welcomeGate', 'cashu', 'i18n', 'notify'],

  css: ['app.scss', 'base.scss', 'buckets.scss'],
  extras: ['roboto-font', 'material-icons'],
  build: {
    target: { browser: ['es2022'] },
    sourcemap: true,
    publicPath: '/',
    vueRouterMode: 'history',
    extendViteConf (viteConf) {
      viteConf.resolve = viteConf.resolve || {}
      viteConf.resolve.alias = {
        ...(viteConf.resolve.alias || {}),
        // We leave the aliases as they are for now.
        buffer: 'buffer',
        process: 'process/browser',
        '@': path.resolve(__dirname, 'src'),
        '@cashu/cashu-ts': path.resolve(
          __dirname,
          'src/lib/cashu-ts/src/index.ts'
        ),
      }
      // This ensures the polyfill plugin is active.
      viteConf.plugins = (viteConf.plugins || []).concat([
        nodePolyfills()
      ])
    }
  },
  framework: {
    config: {
      dark: true
    },
    plugins: ['Notify', 'LocalStorage']
  }
}))
