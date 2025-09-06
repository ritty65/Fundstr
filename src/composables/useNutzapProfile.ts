import { ref, computed, onUnmounted, watch } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import NDK, {
  NDKEvent,
  NDKNip07Signer,
  NDKRelayStatus
} from '@nostr-dev-kit/ndk'
import { useNostrStore } from 'src/stores/nostr'
import { notifySuccess, notifyError } from 'src/js/notify'

type Tier = {
  id: string
  title: string
  price_sats: number
  frequency: 'weekly' | 'monthly'
  description?: string
  media?: string[]
}

type RelayMeta = { url: string; read: boolean; write: boolean }
type RelayCatalog = { all: RelayMeta[]; writable: string[] }
type DiagKind = 'echo' | 'nip11' | 'ws'
type DiagStatus =
  | 'ok'
  | 'timeout'
  | 'http_error'
  | 'unsupported'
  | 'blocked'
  | 'handshake_timeout'
  | 'dns_fail'
  | 'invalid_cert'
  | 'disconnected'
type RelayDiag = { url: string; kind: DiagKind; status: DiagStatus; note?: string }

const MAX_TARGET_RELAYS = 6
const VETTED_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.snort.social',
  'wss://relay.primal.net',
  'wss://nostr.wine',
  'wss://nos.lol',
  'wss://relay.nostr.bg'
]

let localNdk: NDK | null = null
let diagTimer: ReturnType<typeof setInterval> | null = null

export function useNutzapProfile() {
  // -------- form state
  const displayName = ref('')
  const pictureUrl = ref('')
  const p2pkPub = ref('')
  const mintsText = ref('')
  const tiers = ref<Tier[]>([])
  const showTierDialog = ref(false)
  const tierForm = ref({
    id: '',
    title: '',
    price_sats: 0,
    frequency: 'monthly' as const,
    description: '',
    mediaCsv: ''
  })

  const publishing = ref(false)
  const lastPublishInfo = ref('')
  const currentStep = ref<
    | 'IDLE'
    | 'PREPARE'
    | 'CONNECT'
    | 'SIGN_TIERS'
    | 'PUB_TIERS'
    | 'SIGN_PROFILE'
    | 'PUB_PROFILE'
    | 'DONE'
    | 'FAIL'
  >('IDLE')

  const readBackVerify = ref(false)

  // -------- derived
  const mintList = computed(() =>
    mintsText.value.split('\n').map(s => s.trim()).filter(Boolean)
  )

  const nostr = useNostrStore()

  const relayCatalog = ref<RelayCatalog>({ all: [], writable: [] })
  const targets = ref<string[]>([])
  const diagnostics = ref<RelayDiag[]>([])
  const proxyMode = ref(false)
  const echoOk = ref(false)

  const totalRelays = computed(() => targets.value.length || VETTED_RELAYS.length)

  const connectedCount = computed(() => {
    if (!localNdk) return 0
    let c = 0
    localNdk.pool.relays.forEach(r => {
      if (r.status === NDKRelayStatus.CONNECTED) c++
    })
    return c
  })

  const writableConnectedCount = computed(() => {
    if (!localNdk) return 0
    const connected = new Set<string>()
    localNdk.pool.relays.forEach(r => {
      if (r.status === NDKRelayStatus.CONNECTED) connected.add(r.url)
    })
    return relayCatalog.value.writable.filter(u =>
      connected.has(proxify(u))
    ).length
  })

  const publishDisabled = computed(
    () =>
      publishing.value ||
      !p2pkPub.value ||
      mintList.value.length === 0 ||
      tiers.value.length === 0 ||
      writableConnectedCount.value === 0
  )

  const bannerClass = computed(() =>
    writableConnectedCount.value === 0 ? 'bg-warning' : 'bg-positive'
  )

  // -------- tier actions
  function editTier(t: Tier) {
    tierForm.value = {
      id: t.id,
      title: t.title,
      price_sats: t.price_sats,
      frequency: t.frequency,
      description: t.description ?? '',
      mediaCsv: (t.media ?? []).join(', ')
    }
    showTierDialog.value = true
  }

  function removeTier(id: string) {
    tiers.value = tiers.value.filter(t => t.id !== id)
  }

  function saveTier() {
    const f = tierForm.value
    const media = f.mediaCsv.split(',').map(s => s.trim()).filter(Boolean)
    if (!f.id) {
      tiers.value.push({
        id: uuidv4(),
        title: f.title.trim(),
        price_sats: +f.price_sats,
        frequency: f.frequency,
        description: f.description?.trim(),
        media
      })
    } else {
      const idx = tiers.value.findIndex(t => t.id === f.id)
      if (idx !== -1) {
        tiers.value[idx] = {
          ...tiers.value[idx],
          title: f.title.trim(),
          price_sats: +f.price_sats,
          frequency: f.frequency,
          description: f.description?.trim(),
          media
        }
      }
    }
    tierForm.value = {
      id: '',
      title: '',
      price_sats: 0,
      frequency: 'monthly',
      description: '',
      mediaCsv: ''
    }
  }

  // -------- helpers
  async function canOpenWs(url = 'wss://echo.websocket.events', ms = 3000) {
    return new Promise<boolean>(resolve => {
      let done = false
      let ws: WebSocket | null = null
      const t = setTimeout(() => {
        if (!done) {
          done = true
          try {
            ws?.close()
          } catch {
            /* ignore */
          }
          resolve(false)
        }
      }, ms)
      try {
        ws = new WebSocket(url)
        ws.onopen = () => {
          if (!done) {
            done = true
            clearTimeout(t)
            ws!.close()
            resolve(true)
          }
        }
        ws.onerror = () => {
          if (!done) {
            done = true
            clearTimeout(t)
            resolve(false)
          }
        }
      } catch {
        clearTimeout(t)
        resolve(false)
      }
    })
  }

  async function nip11Probe(relayWssUrl: string, ms = 2000) {
    const https = relayWssUrl.replace(/^wss:/, 'https:')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ms)
    try {
      const res = await fetch(https, {
        headers: { Accept: 'application/nostr+json' },
        signal: controller.signal
      })
      clearTimeout(timer)
      if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }
      const json = await res.json().catch(() => null)
      if (
        !json ||
        !Array.isArray(json.supported_nips) ||
        !json.supported_nips.includes(1)
      ) {
        return { ok: false, reason: 'unsupported or malformed NIP-11' }
      }
      return { ok: true, info: json }
    } catch (e: any) {
      clearTimeout(timer)
      return {
        ok: false,
        reason: e?.name === 'AbortError' ? 'timeout' : String(e)
      }
    }
  }

  function sanitizeUrl(u: string) {
    if (!u) return ''
    try {
      const url = new URL(u.trim())
      if (url.protocol !== 'wss:') return ''
      url.hash = ''
      url.search = ''
      return url.href.replace(/\/+$/, '')
    } catch {
      return ''
    }
  }

  function uniq<T>(arr: T[]) {
    return [...new Set(arr)]
  }

  function buildRelayTargets(
    signerRelays: Record<string, { read: boolean; write: boolean }> | undefined,
    defaultsFromSettings: string[] | undefined
  ) {
    const signerWrite = signerRelays
      ? Object.entries(signerRelays)
          .filter(([, p]) => !!p.write)
          .map(([u]) => sanitizeUrl(u))
      : []

    const settings = (defaultsFromSettings ?? []).map(sanitizeUrl)
    const vetted = VETTED_RELAYS.map(sanitizeUrl)

    const merged = uniq([...signerWrite, ...settings, ...vetted])
      .filter(Boolean)
      .slice(0, MAX_TARGET_RELAYS)

    const all = merged.map(u => ({ url: u, read: true, write: true }))
    const writable = [...merged]
    return { all, writable, targets: merged }
  }

  function proxify(u: string) {
    if (!proxyMode.value) return u
    const base = `${location.origin.replace(/^http/, 'ws')}/ws`
    return `${base}?target=${encodeURIComponent(u)}`
  }

  function unproxify(u: string) {
    if (!proxyMode.value) return u
    try {
      const url = new URL(u)
      return url.searchParams.get('target') || u
    } catch {
      return u
    }
  }

  async function getLocalNdk(targetUrls: string[], withSigner: boolean) {
    if (localNdk) {
      try {
        await localNdk.pool?.disconnect?.()
      } catch {
        /* ignore */
      }
    }
    localNdk = new NDK({ explicitRelayUrls: targetUrls })
    if (withSigner) localNdk.signer = new NDKNip07Signer()
    await localNdk.connect({ timeout: 6000 })

    // basic error listeners (best effort)
    localNdk.pool.relays.forEach(r => {
      const orig = unproxify(r.url)
      r.connectivity.on('close', () => refreshDiagnostics())
      r.connectivity.on('connect', () => refreshDiagnostics())
      r.connectivity.on('error', e => {
        diagnostics.value.push({
          url: orig,
          kind: 'ws',
          status: mapWsError(e),
          note: String(e)
        })
        refreshDiagnostics()
      })
    })

    return localNdk
  }

  async function waitForWritableRelay(
    ndk: NDK,
    writableUrls: string[],
    ms = 7000
  ) {
    const deadline = Date.now() + ms
    while (Date.now() < deadline) {
      const connected: string[] = []
      ndk.pool.relays.forEach(r => {
        if (r.status === NDKRelayStatus.CONNECTED) connected.push(r.url)
      })
      if (connected.some(u => writableUrls.includes(u))) return true
      await new Promise(r => setTimeout(r, 250))
    }
    throw new Error('No writable relay connected')
  }

  function refreshDiagnostics() {
    const base = diagnostics.value.filter(d => d.kind !== 'ws')
    targets.value.forEach(url => {
      const r = localNdk?.pool.relays.get(proxify(url))
      const existing = diagnostics.value.find(
        d => d.kind === 'ws' && d.url === url
      )
      base.push({
        url,
        kind: 'ws',
        status:
          r && r.status === NDKRelayStatus.CONNECTED
            ? 'ok'
            : existing?.status || 'disconnected',
        note: existing?.note
      })
    })
    diagnostics.value = base
  }

  function mapWsError(e: unknown): DiagStatus {
    const msg = String(e || '')
    if (msg.includes('ERR_CERT')) return 'invalid_cert'
    if (msg.includes('ERR_NAME_NOT_RESOLVED')) return 'dns_fail'
    if (msg.includes('timeout')) return 'handshake_timeout'
    return 'disconnected'
  }

  async function reconnectAll() {
    currentStep.value = 'CONNECT'
    try {
      const candidates = targets.value.length ? targets.value : VETTED_RELAYS
      diagnostics.value = []
      echoOk.value = await canOpenWs()
      diagnostics.value.push({
        url: 'echo',
        kind: 'echo',
        status: echoOk.value ? 'ok' : 'blocked'
      })
      const good: string[] = []
      for (const url of candidates) {
        const r = await nip11Probe(url)
        const status = r.ok
          ? 'ok'
          : r.reason?.includes('timeout')
            ? 'timeout'
            : r.reason?.startsWith('HTTP')
              ? 'http_error'
              : 'unsupported'
        diagnostics.value.push({
          url,
          kind: 'nip11',
          status,
          note: r.ok ? undefined : r.reason
        })
        if (r.ok) good.push(url)
      }
      targets.value = good
      if (!good.length) return
      await getLocalNdk(good.map(proxify), false)
      refreshDiagnostics()
    } catch (e) {
      console.warn('[nutzap-profile] reconnect error', e)
    }
  }

  async function useVetted() {
    const { all, writable, targets: picked } = buildRelayTargets(
      undefined,
      VETTED_RELAYS
    )
    relayCatalog.value = { all, writable }
    targets.value = picked
    await reconnectAll()
  }

  function buildKind30019Tiers(pubkey: string, list: Tier[]) {
    return {
      kind: 30019,
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['d', 'tiers']],
      content: JSON.stringify(
        list.map(t => ({
          id: t.id,
          title: t.title,
          price: t.price_sats,
          frequency: t.frequency,
          description: t.description ?? '',
          media: t.media ?? []
        }))
      )
    }
  }

  function buildKind10019NutzapProfile(
    pubkey: string,
    payload: {
      p2pk: string
      mints: string[]
      relays?: string[]
      tierAddr?: string
      v?: string
      displayName?: string
      picture?: string
    }
  ) {
    const tags: string[][] = [
      ['t', 'nutzap-profile'],
      ['client', 'fundstr']
    ]
    if (payload.relays) payload.relays.forEach(r => tags.push(['relay', r]))
    payload.mints.forEach(m => tags.push(['mint', m, 'sat']))
    if (payload.displayName) tags.push(['name', payload.displayName])
    if (payload.picture) tags.push(['picture', payload.picture])

    const content = JSON.stringify({
      p2pk: payload.p2pk,
      mints: payload.mints,
      relays: payload.relays ?? undefined,
      tierAddr: payload.tierAddr ?? undefined,
      v: payload.v ?? '1'
    })

    return {
      kind: 10019,
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content
    }
  }

  async function publishToWritableWithAck(
    ndk: NDK,
    ev: NDKEvent,
    writableUrls: string[]
  ) {
    const chosen = new Set(writableUrls)
    const pubs = [...ndk.pool.relays.values()]
      .filter(r => chosen.has(r.url))
      .map(r => r.publish(ev))
    await Promise.any(pubs)
  }

  async function publishAll() {
    if (!p2pkPub.value) {
      notifyError('P2PK public key is required')
      return
    }
    if (mintList.value.length === 0) {
      notifyError('At least one trusted mint is required')
      return
    }
    if (tiers.value.length === 0) {
      notifyError('Add at least one tier')
      return
    }

    await nostr.initSignerIfNotSet?.()
    if (!nostr.signer || !nostr.pubkey) {
      notifyError('No Nostr signer available. Unlock/connect your NIP-07 extension.')
      return
    }

    publishing.value = true
    currentStep.value = 'PREPARE'
    try {
      const signer: any = nostr.signer
      const signerRelays = await signer?.getRelays?.()
      const defaults = Array.isArray(nostr.relays) && nostr.relays.length
        ? (nostr.relays as string[])
        : VETTED_RELAYS

      const { all, writable, targets: picked } = buildRelayTargets(
        signerRelays as any,
        defaults
      )

      diagnostics.value = []
      echoOk.value = await canOpenWs()
      diagnostics.value.push({
        url: 'echo',
        kind: 'echo',
        status: echoOk.value ? 'ok' : 'blocked'
      })
      const good: string[] = []
      for (const url of picked) {
        const r = await nip11Probe(url)
        const status = r.ok
          ? 'ok'
          : r.reason?.includes('timeout')
            ? 'timeout'
            : r.reason?.startsWith('HTTP')
              ? 'http_error'
              : 'unsupported'
        diagnostics.value.push({
          url,
          kind: 'nip11',
          status,
          note: r.ok ? undefined : r.reason
        })
        if (r.ok) good.push(url)
      }
      targets.value = good
      const writableHealthy = writable.filter(u => good.includes(u))
      relayCatalog.value = { all, writable: writableHealthy }

      if (!writableHealthy.length || !good.length) {
        notifyError(
          'No healthy relays (NIP-11 failed). Try Use Vetted or Proxy mode.'
        )
        publishing.value = false
        return
      }

      currentStep.value = 'CONNECT'
      const ndk = await getLocalNdk(good.map(proxify), true)
      refreshDiagnostics()
      await waitForWritableRelay(ndk, writableHealthy.map(proxify)).catch(() => {
        notifyError('No writable relay connected — cannot publish.')
        throw new Error('CONNECT_FAIL')
      })

      currentStep.value = 'SIGN_TIERS'
      const evTiers = new NDKEvent(
        ndk,
        buildKind30019Tiers(nostr.pubkey, tiers.value)
      )
      try {
        await evTiers.sign(ndk.signer!)
      } catch {
        notifyError(
          'Signing failed. Unlock/approve your NIP-07 extension and try again.'
        )
        throw new Error('SIGN_FAIL')
      }

      currentStep.value = 'PUB_TIERS'
      try {
        await publishToWritableWithAck(ndk, evTiers, writableHealthy.map(proxify))
      } catch {
        notifyError('Publish failed: no relay accepted the tiers event.')
        throw new Error('PUB_FAIL')
      }

      currentStep.value = 'SIGN_PROFILE'
      const evProf = new NDKEvent(
        ndk,
        buildKind10019NutzapProfile(nostr.pubkey, {
          p2pk: p2pkPub.value,
          mints: mintList.value,
          relays: all.map(r => r.url),
          tierAddr: `30019:${nostr.pubkey}:tiers`,
          v: '1',
          displayName: displayName.value || undefined,
          picture: pictureUrl.value || undefined
        })
      )
      try {
        await evProf.sign(ndk.signer!)
      } catch {
        notifyError(
          'Signing failed. Unlock/approve your NIP-07 extension and try again.'
        )
        throw new Error('SIGN_FAIL')
      }

      currentStep.value = 'PUB_PROFILE'
      try {
        await publishToWritableWithAck(ndk, evProf, writableHealthy.map(proxify))
      } catch {
        notifyError('Publish failed: no relay accepted the payment profile.')
        throw new Error('PUB_FAIL')
      }

      if (readBackVerify.value) {
        // optional: read-back verify placeholder
      }

      lastPublishInfo.value = `30019:${evTiers.id} • 10019:${evProf.id}`
      notifySuccess('Nutzap profile & tiers published')
      currentStep.value = 'DONE'
    } catch (e) {
      console.warn('[nutzap-profile] publish error', e)
      currentStep.value = 'FAIL'
    } finally {
      publishing.value = false
    }
  }

  function copyDebug() {
    const payload = {
      echoOk: echoOk.value,
      proxyMode: proxyMode.value,
      targets: targets.value,
      relayCatalog: relayCatalog.value,
      diagnostics: diagnostics.value,
      lastPublishInfo: lastPublishInfo.value,
      currentStep: currentStep.value
    }
    navigator.clipboard?.writeText(JSON.stringify(payload, null, 2))
  }

  // keep diagnostics updated
  diagTimer = setInterval(() => refreshDiagnostics(), 2000)
  watch(proxyMode, () => reconnectAll())
  onUnmounted(() => {
    if (diagTimer) clearInterval(diagTimer)
    try {
      localNdk?.pool?.disconnect?.()
    } catch {
      /* ignore */
    }
    localNdk = null
  })

  // initial vetted connect
  useVetted()

  return {
    // state
    displayName,
    pictureUrl,
    p2pkPub,
    mintsText,
    tiers,
    tierForm,
    showTierDialog,
    publishing,
    lastPublishInfo,
    diagnostics,
    proxyMode,
    // derived
    connectedCount,
    writableConnectedCount,
    totalRelays,
    publishDisabled,
    bannerClass,
    // actions
    editTier,
    removeTier,
    saveTier,
    publishAll,
    reconnectAll,
    useVetted,
    copyDebug,
    // debug
    currentStep,
    readBackVerify
  }
}

