/* eslint-env node */

import { configure } from 'quasar/wrappers'
import path from 'path'
import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default configure(() => ({
  boot: ['welcomeGate', 'cashu', 'i18n', 'node-globals', 'nostrProvider'],
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
        buffer: 'buffer',
        process: 'process/browser',
        '@': path.resolve(__dirname, 'src'),
        '@cashu/cashu-ts': path.resolve(__dirname, 'src/lib/cashu-ts/src/index.ts'),
        '@noble/curves/secp256k1': '@noble/curves/esm/secp256k1.js',
        '@noble/curves/esm': path.resolve(__dirname, 'node_modules/@noble/curves/esm'),
        '@noble/curves/esm/secp256k1.js': path.resolve(
          __dirname,
          'node_modules/@noble/curves/esm/secp256k1.js'
        ),
      }
    }
  },
  framework: {
    config: {},
    plugins: ['Notify', 'LocalStorage']
  }
}))
