<template>
  <div class="container">
    <div class="search-container">
      <h1 class="section-title">Nostr User Search</h1>
      <p class="text-sm text-center text-gray-600 mb-6">
        Search by name, npub, or NIP-05 identifier (e.g., user@domain.com).
      </p>
      <input
        id="searchInput"
        type="text"
        class="search-input"
        placeholder="Search Nostr profiles..."
      />
      <div id="loader" class="loader" />
      <ul id="resultsList" class="results-list" />
      <p id="statusMessage" class="status-message hidden" />
      <button id="retryButton" class="retry-button hidden" type="button">
        Retry
      </button>
    </div>

    <div class="featured-creators-container">
      <h2 class="section-title">Featured Creators</h2>
      <div id="featuredCreatorsLoader" class="loader" style="display: block" />
      <div id="featuredCreatorsGrid" class="featured-creators-grid" />
      <p id="featuredStatusMessage" class="status-message hidden" />
    </div>

    <div class="relay-info">Connecting to: <span id="relayList"></span></div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { SimplePool, nip19 } from 'nostr-tools'
import { filterHealthyRelays } from 'src/utils/relayHealth'

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://relay.snort.social',
  'wss://nos.lol',
  'wss://relay.nostr.band'
]

const nip05Regex = /^[a-z0-9._-]+@[a-z0-9.-]+$/i

let RELAYS = [...DEFAULT_RELAYS]
let pool: SimplePool
let currentSearchAbortController: AbortController | null = null
let lastSearchQuery = ''

onMounted(() => {
  init()
})

function escapeHtml (unsafe: string | null | undefined): string {
  if (!unsafe) return ''
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function debounce<T extends (...args: any[]) => void> (fn: T, delay: number) {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

async function init () {
  const searchInputElement = document.getElementById('searchInput') as HTMLInputElement
  const resultsListElement = document.getElementById('resultsList') as HTMLElement
  const statusMessageElement = document.getElementById('statusMessage') as HTMLElement
  const loaderElement = document.getElementById('loader') as HTMLElement
  const retryButtonElement = document.getElementById('retryButton') as HTMLButtonElement
  const relayListElement = document.getElementById('relayList') as HTMLElement
  const featuredCreatorsGridElement = document.getElementById('featuredCreatorsGrid') as HTMLElement
  const featuredStatusMessageElement = document.getElementById('featuredStatusMessage') as HTMLElement
  const featuredCreatorsLoaderElement = document.getElementById('featuredCreatorsLoader') as HTMLElement

  try {
    RELAYS = await filterHealthyRelays(DEFAULT_RELAYS)
  } catch {
    RELAYS = DEFAULT_RELAYS
  }
  relayListElement.textContent = RELAYS.join(', ')
  pool = new SimplePool({ eoseSubTimeout: 8000 })

  async function loadFeatured () {
    try {
      const res = await fetch('featured-creators.json')
      if (res.ok) {
        const profiles = await res.json()
        renderProfiles(profiles, featuredCreatorsGridElement, true)
        featuredStatusMessageElement.classList.add('hidden')
      } else {
        featuredStatusMessageElement.textContent = 'Could not load featured creators.'
        featuredStatusMessageElement.classList.remove('hidden')
      }
    } catch {
      featuredStatusMessageElement.textContent = 'Could not load featured creators.'
      featuredStatusMessageElement.classList.remove('hidden')
    } finally {
      featuredCreatorsLoaderElement.style.display = 'none'
    }
  }

  loadFeatured()

  async function handleSearch (query: string) {
    lastSearchQuery = query
    if (!query) {
      resultsListElement.innerHTML = ''
      statusMessageElement.classList.add('hidden')
      retryButtonElement.classList.add('hidden')
      return
    }

    currentSearchAbortController?.abort()
    const controller = new AbortController()
    currentSearchAbortController = controller

    loaderElement.style.display = 'block'
    resultsListElement.innerHTML = ''
    statusMessageElement.classList.add('hidden')
    retryButtonElement.classList.add('hidden')

    try {
      let filter
      if (nip05Regex.test(query)) {
        const pubkey = await resolveNip05(query, controller.signal)
        if (!pubkey) throw new Error('not found')
        filter = { kinds: [0], authors: [pubkey] }
      } else {
        try {
          const { type, data } = nip19.decode(query)
          if (type === 'npub' && typeof data === 'string') {
            filter = { kinds: [0], authors: [data] }
          }
        } catch {}
      }
      if (!filter) {
        filter = { kinds: [0], search: query }
      }
      const profiles = await fetchProfilesFromRelays(RELAYS, filter, controller.signal)
      if (profiles.length === 0) {
        statusMessageElement.textContent = 'No results found.'
        statusMessageElement.classList.remove('hidden')
      } else {
        renderProfiles(profiles, resultsListElement)
      }
    } catch (e) {
      if (controller.signal.aborted) return
      statusMessageElement.textContent = 'Search failed'
      statusMessageElement.classList.remove('hidden')
      retryButtonElement.classList.remove('hidden')
    } finally {
      loaderElement.style.display = 'none'
    }
  }

  const debouncedSearch = debounce(handleSearch, 500)
  searchInputElement.addEventListener('input', e => {
    debouncedSearch((e.target as HTMLInputElement).value)
  })

  retryButtonElement.addEventListener('click', () => {
    if (lastSearchQuery) handleSearch(lastSearchQuery)
  })
}

async function resolveNip05 (nip05: string, signal: AbortSignal): Promise<string | null> {
  const match = nip05.match(nip05Regex)
  if (!match) return null
  const [, localPart, domain] = match
  try {
    const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(localPart)}`
    const res = await fetch(url, { signal })
    if (!res.ok) return null
    const data = await res.json()
    return data.names?.[localPart] || null
  } catch {
    return null
  }
}

async function fetchProfilesFromRelays (relays: string[], filter: any, signal: AbortSignal) {
  const events = await pool.list(relays, [filter], signal as any)
  const profileMap = new Map<string, any>()
  events.forEach(event => {
    try {
      const profile = JSON.parse(event.content)
      const existing = profileMap.get(event.pubkey)
      if (!existing || event.created_at > existing.event.created_at) {
        profileMap.set(event.pubkey, {
          pubkey: event.pubkey,
          name: profile.name || profile.display_name || profile.username || '',
          picture: profile.picture || '',
          about: profile.about || '',
          lud16: profile.lud16 || '',
          event
        })
      }
    } catch (e) {
      console.error('Failed to parse profile', e)
    }
  })
  return Array.from(profileMap.values())
}

function renderProfiles (profiles: any[], targetElement: HTMLElement, featured = false) {
  targetElement.innerHTML = ''
  profiles.forEach(profile => {
    const li = document.createElement('li')
    li.className = featured ? 'creator-card' : 'result-item'
    const title = profile.name || profile.pubkey
    li.innerHTML = `<div class="profile-header"><img class="avatar" src="${escapeHtml(profile.picture)}" alt="" /><div class="info"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(profile.about)}</p></div></div>`
    li.addEventListener('click', () => {
      window.postMessage({ type: 'viewProfile', pubkey: profile.pubkey }, '*')
    })
    targetElement.appendChild(li)
  })
}
</script>

<style scoped>
.container {
  max-width: 900px;
  margin: 0 auto;
  padding: 1rem;
}
.search-container,
.featured-creators-container {
  margin: 2rem auto;
  padding: 2rem;
  background-color: white;
  border-radius: 0.75rem;
  box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05);
}
.search-input {
  width: 100%;
  padding: 0.875rem 1.25rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
}
.results-list,
.featured-creators-grid {
  margin-top: 1.5rem;
  list-style: none;
  padding: 0;
}
.featured-creators-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill,minmax(280px,1fr));
  gap: 1.5rem;
}
.result-item,
.creator-card {
  padding: 1.25rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  margin-bottom: 1rem;
  background-color: #fdfdff;
  transition: all 0.2s ease-in-out;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.profile-header {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  width: 100%;
}
.profile-header img.avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid #e2e8f0;
  flex-shrink: 0;
}
.profile-header .info {
  flex-grow: 1;
  min-width: 0;
}
.profile-header .info h3 {
  font-size: 1.125rem;
  font-weight: 600;
  color: #2d3748;
  word-break: break-word;
  margin-bottom: 0.25rem;
}
.profile-header .info p {
  font-size: 0.875rem;
  color: #4a5568;
  margin-top: 0.1rem;
  word-break: break-word;
  line-height: 1.4;
}
.loader {
  display: none;
  margin: 1.5rem auto;
  border: 4px solid #e2e8f0;
  border-top: 4px solid #4299e1;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.status-message {
  text-align: center;
  color: #718096;
  padding: 1.5rem;
  font-style: italic;
}
.retry-button {
  margin: 0 auto;
  margin-top: -1rem;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: white;
  background-color: #4299e1;
  border-radius: 0.375rem;
  transition: background-color 0.2s;
  display: block;
}
.hidden {
  display: none;
}
</style>
