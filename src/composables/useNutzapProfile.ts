import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { NDKEvent } from '@nostr-dev-kit/ndk'
import { useNostrStore } from 'src/stores/nostr'
import { useNdk } from 'src/composables/useNdk'
import { notifySuccess, notifyError } from 'src/js/notify'

type Tier = {
  id: string
  title: string
  price_sats: number
  frequency: 'weekly' | 'monthly'
  description?: string
  media?: string[]
}

const DEFAULT_WRITE_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol'
]

const VETTED_OPEN_WRITE_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.snort.social'
]

const MAX_TARGET_RELAYS = 6 // keep small to avoid WS exhaustion

export function useNutzapProfile() {
  // -------- state
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

  // -------- computed
  const mintList = computed(() =>
    mintsText.value.split('\n').map(s => s.trim()).filter(Boolean)
  )

  const nostr = useNostrStore()

  const relayCatalog = ref<{
    all: { url: string; read: boolean; write: boolean }[]
    writable: string[]
  }>({ all: [], writable: [] })

  const targets = ref<string[]>([])

  const totalRelays = computed(
    () => targets.value.length || DEFAULT_WRITE_RELAYS.length
  )

  const connectedCount = computed(() => {
    const ndk = (window as any).__ndkRef
    if (!ndk) return 0
    let c = 0
    ndk.pool.relays.forEach((r: any) => {
      if (r.status === 1) c++
    })
    return c
  })

  const writableConnectedCount = computed(() => {
    const ndk = (window as any).__ndkRef
    if (!ndk) return 0
    const connected = new Set<string>()
    ndk.pool.relays.forEach((r: any) => {
      if (r.status === 1) connected.add(r.url)
    })
    return relayCatalog.value.writable.filter(u => connected.has(u)).length
  })

  const publishDisabled = computed(() =>
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
    const vetted = VETTED_OPEN_WRITE_RELAYS.map(sanitizeUrl)

    const combined = uniq([...signerWrite, ...settings, ...vetted])
      .filter(Boolean)
      .slice(0, MAX_TARGET_RELAYS)

    const all = combined.map(u => ({ url: u, read: true, write: true }))
    const writable = [...combined]

    return { all, writable, targets: combined }
  }

  async function waitForWritableRelay(ndk: any, writableUrls: string[], ms = 7000) {
    const deadline = Date.now() + ms
    while (Date.now() < deadline) {
      const connected: string[] = []
      ndk.pool.relays.forEach((r: any) => {
        if (r.status === 1) connected.push(r.url)
      })
      if (connected.some(u => writableUrls.includes(u))) return
      await new Promise(r => setTimeout(r, 250))
    }
    throw new Error('No writable relay connected')
  }

  function buildKind30019Tiers(pubkey: string, tiers: Tier[]) {
    return {
      kind: 30019,
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['d', 'tiers']],
      content: JSON.stringify(
        tiers.map(t => ({
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
    opts: { p2pk: string; mints: string[]; relays?: string[]; tierAddr?: string }
  ) {
    const tags: string[][] = []
    tags.push(['pubkey', opts.p2pk])
    for (const m of opts.mints) tags.push(['mint', m])
    if (opts.relays) for (const r of opts.relays) tags.push(['relay', r])
    if (opts.tierAddr) tags.push(['tier', opts.tierAddr])
    return {
      kind: 10019,
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: ''
    }
  }

  async function publishToWritableWithAck(ndk: any, ev: NDKEvent, writableUrls: string[]) {
    const targets = new Set(writableUrls)
    const pubs = [...ndk.pool.relays.values()]
      .filter((r: any) => targets.has(r.url))
      .map((r: any) => r.publish(ev))
    await Promise.any(pubs)
  }

  async function reconnectAll() {
    const ndk = await useNdk()
    await nostr.connect(
      targets.value.length ? targets.value : DEFAULT_WRITE_RELAYS
    )
    ;(window as any).__ndkRef = ndk
  }

  function useVetted() {
    const { all, writable, targets: picked } = buildRelayTargets(
      undefined,
      VETTED_OPEN_WRITE_RELAYS
    )
    relayCatalog.value = { all, writable }
    targets.value = picked
  }

  // -------- publish flow
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

    await nostr.initSignerIfNotSet()
    if (!nostr.signer || !nostr.pubkey) {
      notifyError('No Nostr signer available. Unlock/connect your NIP‑07 extension.')
      return
    }

    publishing.value = true
    try {
      const signer: any = nostr.signer
      const signerRelays = await (signer?.getRelays?.() || undefined)
      const defaults =
        Array.isArray(nostr.relays) && nostr.relays.length
          ? (nostr.relays as string[])
          : DEFAULT_WRITE_RELAYS

      const { all, writable, targets: picked } = buildRelayTargets(
        signerRelays as any,
        defaults
      )
      relayCatalog.value = { all, writable }
      targets.value = picked

      if (relayCatalog.value.writable.length === 0) {
        notifyError('No writable relays configured. Add a relay with write access.')
        return
      }

      const ndk = await useNdk()
      ;(window as any).__ndkRef = ndk
      await nostr.connect(targets.value)
      try {
        await waitForWritableRelay(ndk, relayCatalog.value.writable)
      } catch {
        notifyError('No writable relay connected — cannot publish.')
        return
      }

      const tiersEvent = new NDKEvent(ndk, buildKind30019Tiers(nostr.pubkey, tiers.value))
      try {
        await tiersEvent.sign(signer.ndkSigner ?? signer)
      } catch {
        notifyError('Signing failed. Unlock/approve your Nostr extension and try again.')
        return
      }
      try {
        await publishToWritableWithAck(ndk, tiersEvent, relayCatalog.value.writable)
      } catch {
        notifyError('Publish failed: no relay accepted the tiers event.')
        return
      }

      const profileEvent = new NDKEvent(
        ndk,
        buildKind10019NutzapProfile(nostr.pubkey, {
          p2pk: p2pkPub.value,
          mints: mintList.value,
          relays: relayCatalog.value.all.map(r => r.url),
          tierAddr: `30019:${nostr.pubkey}:tiers`
        })
      )
      try {
        await profileEvent.sign(signer.ndkSigner ?? signer)
      } catch {
        notifyError('Signing failed. Unlock/approve your Nostr extension and try again.')
        return
      }
      try {
        await publishToWritableWithAck(ndk, profileEvent, relayCatalog.value.writable)
      } catch {
        notifyError('Publish failed: no relay accepted the payment profile.')
        return
      }

      notifySuccess('Nutzap profile & tiers published')
      lastPublishInfo.value = `30019:${tiersEvent.id} • 10019:${profileEvent.id}`
    } catch (e: any) {
      notifyError(e?.message ?? String(e))
    } finally {
      publishing.value = false
    }
  }

  return {
    // state
    p2pkPub,
    mintsText,
    tiers,
    tierForm,
    showTierDialog,
    publishing,
    lastPublishInfo,
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
    useVetted
  }
}

