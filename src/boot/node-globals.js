import { boot } from 'quasar/wrappers'
import { Buffer } from 'buffer'
import process from 'process'

export default boot(() => {
  if (!globalThis.Buffer) globalThis.Buffer = Buffer
  if (!globalThis.process) globalThis.process = process
  if (!globalThis.global) globalThis.global = globalThis
})
