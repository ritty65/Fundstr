import { boot } from 'quasar/wrappers'
import { createI18n } from 'vue-i18n'

const modules = import.meta.glob('../i18n/*/index.{ts,js}', { eager: true })

const messages = {}
for (const p in modules) {
  const mod = modules[p]
  const m = mod.default || mod
  const match = p.match(/\.\.\/i18n\/([^/]+)\/index\.(?:ts|js)$/)
  if (match) messages[match[1]] = m
}

const fallbackLocale = 'en-US'
let locale = (typeof navigator !== 'undefined' && (navigator.language || navigator.userLanguage)) || fallbackLocale
if (!messages[locale]) {
  const short = locale.split('-')[0].toLowerCase()
  const candidate = Object.keys(messages).find(k => k.toLowerCase().startsWith(short))
  locale = candidate || fallbackLocale
}

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale,
  fallbackLocale,
  messages
})

export default boot(({ app }) => {
  app.use(i18n)
})
