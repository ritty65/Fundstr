/* eslint-env node */

import { configure } from 'quasar/wrappers'
import path from 'path'
import { fileURLToPath } from 'url'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { sentryVitePlugin } from '@sentry/vite-plugin'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default configure((ctx) => ({
  // 1. 'node-globals' boot file is removed. This is correct.
  boot: [
    'sentry',
    'fundstr-preload',
    'welcomeGate',
    'cashu',
    'i18n',
    'notify',
    'nostr-provider',
    'prefetch-featured-creators',
    'fundstrRelay',
    'e2e-test-api',
  ],

  css: ['app.scss', 'base.scss', 'buckets.scss'],
  extras: ['roboto-font', 'material-icons'],
  build: {
    target: { browser: ['es2022'] },
    sourcemap: true,
    publicPath: './',
    vueRouterMode: 'history',
    extendViteConf (viteConf) {
      if (ctx.prod) {
        viteConf.esbuild = {
          drop: ['console', 'debugger']
        }
      }

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
        }),
        sentryVitePlugin({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          authToken: process.env.SENTRY_AUTH_TOKEN,
          release:
            process.env.SENTRY_RELEASE ||
            process.env.VITE_SENTRY_RELEASE ||
            process.env.GITHUB_SHA,
          deploy: (process.env.SENTRY_ENVIRONMENT || process.env.VITE_APP_ENV)
            ? { env: process.env.SENTRY_ENVIRONMENT || process.env.VITE_APP_ENV }
            : undefined,
          sourcemaps: {
            assets: './dist/pwa/assets/**'
          },
          telemetry: false,
          disable: !(
            process.env.SENTRY_AUTH_TOKEN &&
            process.env.SENTRY_ORG &&
            process.env.SENTRY_PROJECT
          )
        })
      ])
    }
  },
  framework: {
    config: {
      dark: true
    },
    plugins: ['Notify', 'Dialog', 'LocalStorage']
  }
}))
