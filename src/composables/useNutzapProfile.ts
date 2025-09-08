import { ref, computed, onUnmounted, watch } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import NDK, {
  NDKEvent,
  NDKRelayStatus
} from '@nostr-dev-kit/ndk'
import { Event } from 'nostr-tools'
import { publishWithFallback } from '@/lib/publish'
import { fetchRelayInfo } from '@/lib/relayInfo'
import { PRIMARY_RELAY, FUNDSTR_PRIMARY_RELAY } from '@/config/relays'
import { useNostrStore } from 'src/stores/nostr'
import { notify, notifySuccess, notifyError } from 'src/js/notify'
import { getNdk } from '@/boot/ndk'

const PROXY_BASE_HTTP = import.meta.env.VITE_PROXY_BASE_HTTP || ''
const PROXY_BASE_WSS = import.meta.env.VITE_PROXY_BASE_WSS || ''

function hasHttpProxy() {
  return !!PROXY_BASE_HTTP
}

function hasWsProxy() {
  return !!PROXY_BASE_WSS
}

// fetch creator relay list via HTTP bridge
async function fetchViaProxy(pubkey: string, kind: number) {
  if (!hasHttpProxy()) return []
  const filters = [{ authors: [pubkey], kinds: [kind], limit: 1 }]
  const url = `${PROXY_BASE_HTTP}/req?filters=${encodeURIComponent(
    JSON.stringify(filters)
  )}`
  try {
    const res = await fetch(url)
    const j = await res.json().catch(() => null)
    return Array.isArray(j?.events) ? j.events : []
  } catch {
    return []
  }
}

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
type DiagKind = 'echo' | 'nip11' | 'ws' | 'proxy'
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
  | 'on'
  | 'misconfigured'
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
let switchingProxy = false

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
    | 'PUB_SECURE'
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
  const creatorRelays = ref<string[]>([])
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
    return relayCatalog.value.writable.filter(u => connected.has(maybeProxyWs(u))).length
  })

  const publishDisabled = computed(
    () =>
      publishing.value ||
      !p2pkPub.value ||
      mintList.value.length === 0 ||
      tiers.value.length === 0 ||
      (!proxyMode.value && writableConnectedCount.value === 0)
  )

  const bannerClass = computed(() =>
    writableConnectedCount.value === 0 ? 'bg-warning' : 'bg-positive'
  )

  const bannerHint = computed(() =>
    echoOk.value ? '' : 'WS likely blocked; try Proxy mode or pause blockers'
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
  async function echoWsOk(): Promise<boolean> {
    const hosts = ['wss://echo.websocket.events', 'wss://echo-websocket.fly.dev/']
    for (const h of hosts) {
      const ok = await new Promise<boolean>(resolve => {
        let done = false,
          t: any,
          ws: WebSocket
        try {
          ws = new WebSocket(h)
          t = setTimeout(() => {
            if (!done) {
              done = true
              try {
                ws.close()
              } catch {}
              resolve(false)
            }
          }, 2500)
          ws.onopen = () => {
            if (!done) {
              done = true
              clearTimeout(t)
              ws.close()
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
          resolve(false)
        }
      })
      if (ok) return true
    }
    return false
  }

  async function nip11Probe(urlWss: string, ms = 2000) {
    const https = urlWss.replace(/^wss:/, 'https:')
    const endpoint =
      proxyMode.value && urlWss === PRIMARY_RELAY && hasHttpProxy()
        ? proxifyHttp() + '/'
        : https
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ms)
    try {
      const res = await fetch(endpoint, {
        headers: { Accept: 'application/nostr+json' },
        signal: controller.signal
      })
      clearTimeout(timer)
      if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }
      const j = await res.json().catch(() => null)
      if (!j || !Array.isArray(j.supported_nips) || !j.supported_nips.includes(1))
        return { ok: false, reason: 'unsupported or malformed NIP-11' }
      return { ok: true, info: j }
    } catch (e: any) {
      clearTimeout(timer)
      return { ok: false, reason: e?.name === 'AbortError' ? 'timeout' : 'http_error' }
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

  async function fetchCreatorRelayList(pubkey: string) {
    const events = await fetchViaProxy(pubkey, 10002)
    const e = events[0]
    if (!e || !Array.isArray(e.tags)) return []
    return e.tags
      .filter((t: any) => t[0] === 'r' && t[1])
      .map((t: any) => sanitizeUrl(t[1]))
      .filter(Boolean)
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

    // PRIMARY first, then signer write relays, settings, and vetted
    const merged = uniq([
      PRIMARY_RELAY,
      ...signerWrite,
      ...settings,
      ...VETTED_RELAYS
    ])
      .filter(Boolean)
      .slice(0, MAX_TARGET_RELAYS)

    const all = merged.map(u => ({ url: u, read: true, write: true }))
    const writable = [...merged]
    return { all, writable, targets: merged }
  }

  function proxifyWs(u: string) {
    return hasWsProxy()
      ? `${PROXY_BASE_WSS}?target=${encodeURIComponent(u)}`
      : u
  }

  // HTTP bridge base URL
  function proxifyHttp(): string {
    return PROXY_BASE_HTTP
  }

  // only proxy WS for the primary relay
  function maybeProxyWs(u: string) {
    return proxyMode.value && u === PRIMARY_RELAY ? proxifyWs(u) : u
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

  function pushDiag(d: RelayDiag) {
    const idx = diagnostics.value.findIndex(
      x => x.url === d.url && x.kind === d.kind
    )
    if (idx !== -1) diagnostics.value[idx] = d
    else diagnostics.value.push(d)
  }

  function attachRelayListeners(ndk: NDK) {
    ndk.pool.relays.forEach((r: any) => {
      const conn = r.connectivity
      if (conn && typeof conn.on === 'function') {
        conn.on('close', refreshWsDiagnostics)
        conn.on('connect', refreshWsDiagnostics)
        conn.on('error', (e: any) =>
          pushDiag({
            url: unproxify(r.url),
            kind: 'ws',
            status: mapWsError(e),
            note: String(e)
          })
        )
      }
    })
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

  function refreshWsDiagnostics() {
    diagnostics.value = diagnostics.value.filter(
      d => d.kind !== 'ws' || targets.value.includes(d.url)
    )
    targets.value.forEach(url => {
      const r = localNdk?.pool.relays.get(maybeProxyWs(url))
      pushDiag({
        url,
        kind: 'ws',
        status: r && r.status === NDKRelayStatus.CONNECTED ? 'ok' : 'disconnected'
      })
    })
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
      const candidates =
        targets.value.length ? targets.value : [PRIMARY_RELAY, ...VETTED_RELAYS]
      diagnostics.value = []
      echoOk.value = await echoWsOk()
      pushDiag({
        url: 'echo',
        kind: 'echo',
        status: echoOk.value ? 'ok' : 'blocked'
      })
      const good: string[] = []
      for (const url of candidates) {
        const r = await nip11Probe(url)
        const status = r.ok
          ? 'ok'
          : r.reason === 'timeout'
            ? 'timeout'
            : r.reason === 'http_error'
              ? 'http_error'
              : 'unsupported'
        pushDiag({
          url,
          kind: 'nip11',
          status,
          note: r.ok ? undefined : r.reason
        })
        if (r.ok) good.push(url)
      }
      const fallback = uniq([...candidates.slice(0, 2), VETTED_RELAYS[0]])
      const goodOrFallback = good.length ? good : fallback
      targets.value = goodOrFallback
      const finalTargets = targets.value.map(maybeProxyWs)
      if (localNdk) {
        try {
          await localNdk.pool?.disconnect?.()
        } catch {
          /* ignore */
        }
      }
      localNdk = new NDK({ explicitRelayUrls: finalTargets })
      await localNdk.connect({ timeout: 6000 })
      attachRelayListeners(localNdk)
      refreshWsDiagnostics()
      setTimeout(async () => {
        if (
          connectedCount.value === 0 &&
          !proxyMode.value &&
          hasHttpProxy() &&
          !switchingProxy
        ) {
          switchingProxy = true
          proxyMode.value = true
          notify('Network blocks WebSockets – switched to Proxy mode')
          await reconnectAll()
          switchingProxy = false
        }
      }, 1800)
    } catch (e) {
      console.warn('[nutzap-profile] reconnect error', e)
    }
  }

  async function useVetted() {
    const merged = uniq([
      PRIMARY_RELAY,
      ...creatorRelays.value,
      ...VETTED_RELAYS
    ]).slice(0, MAX_TARGET_RELAYS)
    relayCatalog.value = {
      all: merged.map(u => ({ url: u, read: true, write: true })),
      writable: [...merged]
    }
    targets.value = merged
    await reconnectAll()
  }

  async function singleConnectionMode() {
    const only = [PRIMARY_RELAY]
    relayCatalog.value = {
      all: only.map(u => ({ url: u, read: true, write: true })),
      writable: [...only]
    }
    targets.value = only
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

  async function verifyReadback(ndk: NDK, id: string, ms = 4000) {
    if (connectedCount.value > 0) {
      return new Promise<string[]>(resolve => {
        const confirmed: string[] = []
        const sub = ndk.subscribe(
          { ids: [id] },
          { closeOnEose: true, groupable: false }
        )
        const t = setTimeout(() => {
          sub.stop()
          resolve(confirmed)
        }, ms)
        sub.on('event', (ev: NDKEvent) => {
          const url = ev.relay?.url ? unproxify(ev.relay.url) : ''
          if (url && !confirmed.includes(url)) confirmed.push(url)
        })
        sub.on('eose', () => {
          clearTimeout(t)
          sub.stop()
          resolve(confirmed)
        })
      })
    } else if (proxyMode.value && hasHttpProxy()) {
      const url = `${PROXY_BASE_HTTP}/req?filters=${encodeURIComponent(
        JSON.stringify([{ ids: [id], limit: 1 }])
      )}`
      try {
        const r = await fetch(url)
        const j = await r.json().catch(() => null)
        const evs = Array.isArray(j?.events) ? j.events : []
        return evs.length === 1 ? ['proxy'] : []
      } catch {
        return []
      }
    } else {
      return []
    }
  }

  async function publishAll() {
    publishing.value = true;
    currentStep.value = 'PREPARE';

    // 1. --- All initial validation checks ---
    if (!p2pkPub.value) {
      publishing.value = false;
      return notifyError('P2PK public key is required');
    }
    if (mintList.value.length === 0) {
      publishing.value = false;
      return notifyError('At least one trusted mint is required');
    }
    if (tiers.value.length === 0) {
      publishing.value = false;
      return notifyError('Add at least one tier');
    }

    await nostr.initSignerIfNotSet?.();
    if (!nostr.signer || !nostr.pubkey) {
      publishing.value = false;
      return notifyError('No Nostr signer available. Unlock/connect your NIP-07 extension.');
    }

    const ndk = await getNdk();
    if (!ndk) {
      publishing.value = false;
      return notifyError('Nostr connection is not available.');
    }

    try {
      // 2. --- Build and Sign Events ---
      currentStep.value = 'SIGN_PROFILE';
      notify('Signing profile and tier events...');

      const unsignedTiersEvent = buildKind30019Tiers(nostr.pubkey, tiers.value);
      const evTiers = new NDKEvent(ndk, unsignedTiersEvent);
      await evTiers.sign(nostr.signer);

      const unsignedProfileEvent = buildKind10019NutzapProfile(nostr.pubkey, {
        p2pk: p2pkPub.value,
        mints: mintList.value,
        relays: relayCatalog.value.all.map(r => r.url),
        tierAddr: `30019:${nostr.pubkey}:tiers`,
        v: '1',
        displayName: displayName.value || undefined,
        picture: pictureUrl.value || undefined,
      });
      const evProf = new NDKEvent(ndk, unsignedProfileEvent);
      await evProf.sign(nostr.signer);

      const eventsToPublish = [evTiers, evProf];

      // 3. --- Securely publish to PRIMARY relay first ---
      currentStep.value = 'PUB_SECURE';
      notify(`Securing profile on ${FUNDSTR_PRIMARY_RELAY}...`);

      // Temporarily add our secure relay to the global NDK pool
      const primaryRelay = ndk.addRelay(FUNDSTR_PRIMARY_RELAY, true);
      await primaryRelay.connect();

      // NDK's publish method is smart. It will use the relay's `publish` method.
      // We create a Set of relays we published to successfully.
      const publishedTo = await ndk.publish(eventsToPublish[0], new Set([primaryRelay]));
      if (!publishedTo.has(primaryRelay)) {
        throw new Error('Failed to publish tiers to the secure relay.');
      }
      const publishedTo2 = await ndk.publish(eventsToPublish[1], new Set([primaryRelay]));
      if (!publishedTo2.has(primaryRelay)) {
        throw new Error('Failed to publish profile to the secure relay.');
      }

      // Clean up by removing the temporary relay from the global pool
      ndk.removeRelay(FUNDSTR_PRIMARY_RELAY);
      notifySuccess('Profile secured successfully.');

      // 4. --- Broadcast to USER'S relays for discovery ---
      currentStep.value = 'PUB_TIERS';
      notify("Broadcasting to your relays...");

      // Use the existing, robust publishWithFallback on the already-signed events
      await publishWithFallback(evTiers.toNostrEvent() as Event, { proxyMode: proxyMode.value });
      await publishWithFallback(evProf.toNostrEvent() as Event, { proxyMode: proxyMode.value });

      // 5. --- Final Success ---
      currentStep.value = 'DONE';
      notifySuccess('Profile published and broadcast successfully!');

    } catch (err) {
      currentStep.value = 'FAIL';
      console.error('[publishAll] A critical error occurred:', err);
      notifyError((err as Error).message);
    } finally {
      // Ensure the primary relay is always removed from the pool, even on error.
      ndk.removeRelay(FUNDSTR_PRIMARY_RELAY);
      publishing.value = false;
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
  diagTimer = setInterval(() => refreshWsDiagnostics(), 2000)
  watch(proxyMode, async (val, old) => {
    if (val && !old) {
      pushDiag({
        url: 'proxy',
        kind: 'proxy',
        status: hasHttpProxy() ? 'on' : 'misconfigured'
      })
    } else if (!val && old) {
      diagnostics.value = diagnostics.value.filter(d => d.kind !== 'proxy')
    }
    if (val !== old && !switchingProxy) await reconnectAll()
  })
  onUnmounted(() => {
    if (diagTimer) clearInterval(diagTimer)
    try {
      localNdk?.pool?.disconnect?.()
    } catch {
      /* ignore */
    }
    localNdk = null
  })

  // initial vetted connect with creator's relays
  fetchCreatorRelayList(nostr.pubkey || '').then(list => {
    creatorRelays.value = list
    useVetted()
  })

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
    bannerHint,
    // actions
    editTier,
    removeTier,
    saveTier,
    publishAll,
    reconnectAll,
    useVetted,
    singleConnectionMode,
    copyDebug,
    // debug
    currentStep,
    readBackVerify
  }
}

