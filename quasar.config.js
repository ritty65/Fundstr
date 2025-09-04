/* eslint-env node */

import { configure } from 'quasar/wrappers'
import path from 'path'
import { fileURLToPath } from 'url'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default configure(() => ({
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
        // The 'buffer' alias is now removed.
        process: 'process/browser',
        '@': path.resolve(__dirname, 'src'),
        '@cashu/cashu-ts': path.resolve(
          __dirname,
          'src/lib/cashu-ts/src/index.ts'
        ),
      }
      viteConf.plugins = (viteConf.plugins || []).concat([
        nodePolyfills({
          exclude: [],
          globals: {
            Buffer: true,
            global: false,
            process: false,
          },
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
  }
}))
