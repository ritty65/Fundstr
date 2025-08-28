<template>
  <!-- Quasar page wrapper so it inherits your app header/drawer/layout spacing -->
  <q-page class="about-theme" :class="{ dark: isDark }">
    <div ref="rootEl" class="antialiased">
      <div class="mx-auto px-4 lg:px-8 max-w-screen-lg">
        <!-- Hero + Alpha warning -->
        <section id="hero" class="pt-20 md:pt-28 pb-8 fade-in-section">
          <div class="grid lg:grid-cols-2 gap-8 items-center">
            <div class="text-center lg:text-left">
              <h1 class="text-5xl md:text-6xl font-extrabold mb-4 leading-tight">
                About <span class="gradient-text">Fundstr</span>
              </h1>
              <p class="text-lg md:text-xl max-w-prose mx-auto lg:mx-0">
                A privacy‑first Bitcoin wallet, social chat, and creator‑monetisation hub
                built on the open‑source Cashu ecash protocol and the decentralised Nostr network.
              </p>
            </div>

            <div class="lg:flex lg:justify-end">
              <div class="alpha-warning flex items-start gap-3" role="alert" aria-live="polite">
                <span class="text-3xl">⚠️</span>
                <p class="text-sm">
                  Fundstr is experimental alpha software. Features may break or change, and loss
                  of funds is possible. Use only small amounts you can afford to lose.
                </p>
              </div>
            </div>
          </div>
        </section>

        <!-- Vision -->
        <section id="vision" class="py-12 md:py-20 fade-in-section">
          <div class="grid lg:grid-cols-2 gap-8 items-center">
            <div class="text-center lg:text-left">
              <h2 class="text-3xl md:text-5xl font-extrabold mb-6 gradient-text">
                Your Money, Your Network
              </h2>
              <p class="text-lg md:text-xl max-w-prose mx-auto lg:mx-0">
                We believe in a world where your financial life and social interactions are truly your own.
                Fundstr is an experiment in creating a parallel, peer‑to‑peer economy—free from corporate
                gatekeepers, surveillance, and unpredictable fees. It’s a gateway to a more sovereign way of
                connecting and transacting.
              </p>
            </div>

            <ul class="list-disc list-inside space-y-2 text-left text-lg pl-8">
              <li>Private payments</li>
              <li>Open protocols</li>
              <li>No gatekeepers</li>
              <li>Low fees</li>
            </ul>
          </div>
        </section>

        <!-- Site Overview -->
        <section id="site-overview" class="py-12 md:py-20 fade-in-section">
          <h2 class="text-3xl md:text-5xl font-extrabold mb-12 text-center gradient-text">
            Site Overview
          </h2>

          <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 text-left">
            <!-- Money -->
            <article class="interactive-card p-6 rounded-2xl flex flex-col h-full">
              <header class="flex items-center gap-3 mb-3">
                <span class="text-2xl">💰</span>
                <h3 class="font-semibold text-xl">Money</h3>
              </header>
              <ul class="space-y-2 text-base">
                <li>
                  <router-link class="row-link" to="/wallet"><span>💳</span> Wallet</router-link>
                </li>
                <li>
                  <router-link class="row-link" to="/buckets"><span>📦</span> Buckets</router-link>
                </li>
                <li>
                  <router-link class="row-link" to="/subscriptions"><span>📄</span> Subscriptions</router-link>
                </li>
              </ul>
            </article>

            <!-- Creators -->
            <article class="interactive-card p-6 rounded-2xl flex flex-col h-full">
              <header class="flex items-center gap-3 mb-3">
                <span class="text-2xl">⭐</span>
                <h3 class="font-semibold text-xl">Creators</h3>
              </header>
              <ul class="space-y-2 text-base">
                <li>
                  <router-link class="row-link" to="/find-creators"><span>🔍</span> Find Creators</router-link>
                </li>
                <li>
                  <router-link class="row-link" to="/creator-hub"><span>👩‍🎨</span> Creator Hub</router-link>
                </li>
                <li>
                  <router-link class="row-link" to="/my-profile"><span>👤</span> My Profile</router-link>
                </li>
              </ul>
            </article>

            <!-- Comms -->
            <article class="interactive-card p-6 rounded-2xl flex flex-col h-full">
              <header class="flex items-center gap-3 mb-3">
                <span class="text-2xl">💬</span>
                <h3 class="font-semibold text-xl">Comms</h3>
              </header>
              <ul class="space-y-2 text-base">
                <li>
                  <router-link class="row-link" to="/nostr-messenger"><span>💬</span> Nostr Messenger</router-link>
                </li>
                <li>
                  <router-link class="row-link" to="/nostr-login"><span>🔑</span> Nostr Login</router-link>
                </li>
              </ul>
            </article>

            <!-- System -->
            <article class="interactive-card p-6 rounded-2xl flex flex-col h-full">
              <header class="flex items-center gap-3 mb-3">
                <span class="text-2xl">⚙️</span>
                <h3 class="font-semibold text-xl">System</h3>
              </header>
              <ul class="space-y-2 text-base">
                <li><router-link class="row-link" to="/settings"><span>⚙️</span> Settings</router-link></li>
                <li><router-link class="row-link" to="/restore"><span>🔄</span> Restore</router-link></li>
                <li><router-link class="row-link" to="/already-running"><span>⚠️</span> Already Running</router-link></li>
                <li><router-link class="row-link" to="/welcome"><span>ℹ️</span> Welcome</router-link></li>
                <li><router-link class="row-link" to="/terms"><span>⚖️</span> Terms</router-link></li>
              </ul>
            </article>
          </div>
        </section>

        <!-- How Ecash Works -->
        <section id="how-it-works" class="py-12 md:py-20 fade-in-section">
          <h2 class="text-3xl md:text-5xl font-extrabold mb-6 text-center gradient-text">
            How Ecash Works
          </h2>
          <p class="text-lg md:text-xl mb-12 max-w-prose mx-auto text-center">
            The loop is simple: Bitcoin in → private e‑cash out → social payments everywhere.
          </p>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div class="how-step interactive-card p-6 flex flex-col items-center text-center h-full rounded-2xl">
              <span class="mb-4 text-4xl">₿</span>
              <h3 class="font-bold text-xl mb-1">Your Bitcoin</h3>
              <p class="text-base">From any wallet</p>
            </div>
            <div class="how-step interactive-card p-6 flex flex-col items-center text-center h-full rounded-2xl">
              <span class="mb-4 text-4xl">🏦</span>
              <h3 class="font-bold text-xl mb-1">The Mint</h3>
              <p class="text-base">Issues ecash tokens</p>
            </div>
            <div class="how-step interactive-card p-6 flex flex-col items-center text-center h-full rounded-2xl">
              <span class="mb-4 text-4xl">👛</span>
              <h3 class="font-bold text-xl mb-1">Fundstr Wallet</h3>
              <p class="text-base">Spend privately</p>
            </div>
          </div>
        </section>

        <!-- Built for the Sovereign Individual -->
        <section id="who-for" class="py-12 md:py-20 fade-in-section">
          <h2 class="text-3xl md:text-5xl font-extrabold mb-12 text-center gradient-text">
            Built for the Sovereign Individual
          </h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div class="interactive-card p-6 flex flex-col items-center text-center h-full rounded-2xl">
              <span class="badge badge-accent mb-2">Creators</span>
              <span class="mb-4 text-4xl">🎨</span>
              <h3 class="font-bold text-xl mb-2">Content Creators</h3>
              <p class="text-base">
                Monetize your audience directly, free from de‑platforming and high fees.
              </p>
            </div>

            <div class="interactive-card p-6 flex flex-col items-center text-center h-full rounded-2xl">
              <span class="badge badge-accent mb-2">Privacy</span>
              <span class="mb-4 text-4xl">🛡️</span>
              <h3 class="font-bold text-xl mb-2">Privacy Advocates</h3>
              <p class="text-base">
                Transact with confidence that your financial life isn't being tracked.
              </p>
            </div>

            <div class="interactive-card p-6 flex flex-col items-center text-center h-full rounded-2xl">
              <span class="badge badge-accent mb-2">Nostr Users</span>
              <span class="mb-4 text-4xl">🔗</span>
              <h3 class="font-bold text-xl mb-2">Nostr Users</h3>
              <p class="text-base">
                Upgrade your zaps to be truly private and integrate payments seamlessly.
              </p>
            </div>

            <div class="interactive-card p-6 flex flex-col items-center text-center h-full rounded-2xl">
              <span class="badge badge-accent mb-2">Global Citizens</span>
              <span class="mb-4 text-4xl">🌍</span>
              <h3 class="font-bold text-xl mb-2">Global Citizens</h3>
              <p class="text-base">
                Move value across borders instantly, without relying on traditional banking.
              </p>
            </div>
          </div>
        </section>

        <!-- Trust Through Transparency -->
        <section id="trust" class="py-12 md:py-20 fade-in-section">
          <h2 class="text-3xl md:text-5xl font-extrabold mb-12 text-center gradient-text">
            Trust Through Transparency
          </h2>

          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8">
            <details class="interactive-card p-6 text-left rounded-2xl">
              <summary class="cursor-pointer">
                <span class="mb-4 text-4xl block">💻</span>
                <span class="block font-bold text-xl mb-2">Open Source &amp; Verifiable</span>
                <span class="block text-base">
                  Fundstr is built on open‑source code. We invite you to inspect, verify, and contribute.
                  Transparency is our core principle.
                </span>
              </summary>
              <div class="mt-4 text-sm space-y-2">
                <p>Anyone can audit our wallet and mint implementations or even reproduce the exact binaries we ship.</p>
                <ul class="list-disc pl-6 space-y-1">
                  <li><a class="ext-link" href="https://opensource.org/osd" target="_blank" rel="noopener">Open Source Definition</a></li>
                  <li><a class="ext-link" href="https://github.com/cashubtc" target="_blank" rel="noopener">Cashu organisation on GitHub</a></li>
                  <li><a class="ext-link" href="https://delvingbitcoin.org/t/building-intuition-for-the-cashu-blind-signature-scheme/506" target="_blank" rel="noopener">Building intuition for Cashu’s scheme</a></li>
                </ul>
              </div>
            </details>

            <details class="interactive-card p-6 text-left rounded-2xl">
              <summary class="cursor-pointer">
                <span class="mb-4 text-4xl block">🔑</span>
                <span class="block font-bold text-xl mb-2">You Hold the Keys</span>
                <span class="block text-base">
                  You are the sole holder of your ecash tokens and Nostr identity.
                  Mints act as custodians for underlying Bitcoin, but only you can spend your ecash.
                </span>
              </summary>
              <div class="mt-4 text-sm space-y-2">
                <p>Owning your private key means only you can authorise payments or posts.</p>
                <ul class="list-disc pl-6 space-y-1">
                  <li><a class="ext-link" href="https://www.coindesk.com/learn/what-is-crypto-custody" target="_blank" rel="noopener">What is crypto custody?</a></li>
                  <li><a class="ext-link" href="https://github.com/nostr-protocol/nips" target="_blank" rel="noopener">Nostr Implementation Possibilities</a></li>
                </ul>
              </div>
            </details>

            <details class="interactive-card p-6 text-left rounded-2xl">
              <summary class="cursor-pointer">
                <span class="mb-4 text-4xl block">🛡️</span>
                <span class="block font-bold text-xl mb-2">Unbreakable Privacy</span>
                <span class="block text-base">
                  Thanks to Chaumian blind signatures, mints cannot link your deposits to your withdrawals.
                  Your spending habits remain completely private.
                </span>
              </summary>
              <div class="mt-4 text-sm space-y-2">
                <p>Blind signatures break the trail between your deposits and spends, even from the mint itself.</p>
                <ul class="list-disc pl-6 space-y-1">
                  <li><a class="ext-link" href="https://bitcoin.design/guide/how-it-works/ecash/cashu/" target="_blank" rel="noopener">Bitcoin Design Guide: Cashu</a></li>
                  <li><a class="ext-link" href="https://blog.cashu.space/buckets-of-blind-signatures/" target="_blank" rel="noopener">Buckets of blind signatures</a></li>
                </ul>
              </div>
            </details>

            <details class="interactive-card p-6 text-left rounded-2xl">
              <summary class="cursor-pointer">
                <span class="mb-4 text-4xl block">👛</span>
                <span class="block font-bold text-xl mb-2">Mint Diversification</span>
                <span class="block text-base">
                  Fundstr supports multiple mints, allowing you to diversify your holdings.
                  Our audit tools warn you of any unusual mint behaviour.
                </span>
              </summary>
              <div class="mt-4 text-sm space-y-2">
                <p>Spreading tokens across independent mints limits custodial risk.</p>
                <ul class="list-disc pl-6 space-y-1">
                  <li><a class="ext-link" href="https://docs.cashu.space/mints" target="_blank" rel="noopener">Cashu docs: mints</a></li>
                  <li><a class="ext-link" href="https://github.com/cashubtc/awesome-cashu" target="_blank" rel="noopener">Awesome Cashu resources</a></li>
                </ul>
              </div>
            </details>
          </div>
        </section>

        <!-- FAQ -->
        <section id="faq" class="py-12 md:py-20 fade-in-section">
          <h2 class="text-3xl md:text-5xl font-extrabold mb-12 text-center gradient-text">
            Frequently Asked Questions
          </h2>

          <div class="mb-6 max-w-lg mx-auto">
            <input
              v-model="faqQuery"
              type="text"
              placeholder="Search questions"
              class="w-full p-3 rounded-xl border focus:outline-none focus:ring-2"
              aria-label="Search FAQ"
            />
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <details
              v-for="(f, i) in filteredFaqs"
              :key="i"
              class="interactive-card p-4 w-full rounded-2xl"
            >
              <summary class="cursor-pointer font-semibold text-lg">{{ f.q }}</summary>
              <div class="mt-4 text-sm" v-html="f.a"></div>
            </details>
          </div>
        </section>

        <!-- Community / CTA -->
        <footer id="community" class="px-0">
          <section class="py-16 fade-in-section">
            <div class="text-center">
              <h2 class="text-3xl md:text-5xl font-extrabold mb-6 gradient-text">
                Join the Conversation
              </h2>
              <p class="mb-6">
                Follow the project and its creator on Nostr to stay up‑to‑date and connect with the community.
              </p>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <a
                  href="https://primal.net/KalonAxiarch"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="interactive-card p-6 flex flex-col items-center text-center h-full focus:outline-none focus:ring-2 rounded-2xl"
                >
                  <span class="mb-2 text-3xl">👤</span>
                  <span class="font-semibold">Creator's Profile</span>
                  <span class="mt-2">↗️</span>
                </a>

                <router-link
                  to="/find-creators?npub=npub1aljmhjp5tqrw3m60ra7t3u8uqq223d6rdg9q0h76a8djd9m4hmvsmlj82m"
                  class="interactive-card p-6 flex flex-col items-center text-center h-full focus:outline-none focus:ring-2 rounded-2xl"
                >
                  <span class="mb-2 text-3xl">💵</span>
                  <span class="font-semibold">View KalonAxiarch's Tiers</span>
                </router-link>
              </div>
            </div>
          </section>

          <!-- Quote -->
          <section class="py-16 fade-in-section">
            <div class="max-w-4xl mx-auto text-center">
              <blockquote>
                Fundstr is powered by open‑source code and an open community. Whether you’re a
                storyteller earning sats or a fan supporting work you love, we hope this guide
                helps you navigate every page with confidence — and makes your next payment feel
                as effortless as a like, comment, or retweet.
              </blockquote>
            </div>
          </section>

          <!-- CTA band -->
          <section id="cta" class="py-16 fade-in-section cta-band rounded-2xl">
            <div class="text-center">
              <h2 class="text-3xl md:text-5xl font-extrabold mb-6 gradient-text">
                Ready to Join the Movement?
              </h2>
              <p class="mb-8">
                Install the PWA, explore the code, or help fund development.
              </p>

              <div class="flex flex-col md:flex-row items-center justify-center gap-4">
                <button
                  @click="handleInstallPwa"
                  class="px-8 py-4 font-bold text-white rounded-lg shadow-lg transition-colors btn-accent-solid"
                >
                  Install PWA
                </button>

                <a
                  href="https://github.com/cashubtc"
                  target="_blank"
                  rel="noopener"
                  class="px-8 py-4 font-bold rounded-lg transition-colors btn-accent-outline"
                >
                  View Code
                </a>

                <router-link
                  to="/creator-hub"
                  class="px-8 py-4 font-bold rounded-lg transition-colors btn-accent-outline"
                >
                  Support Fundstr
                </router-link>
              </div>
            </div>
          </section>
        </footer>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, computed, watchEffect } from 'vue'
import { useQuasar } from 'quasar'

const $q = useQuasar()
const isDark = ref($q.dark.isActive)
watchEffect(() => (isDark.value = $q.dark.isActive))

const rootEl = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

onMounted(() => {
  // fade-in animation per section
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible')
          observer?.unobserve(e.target)
        }
      })
    },
    { threshold: 0.1 }
  )
  rootEl.value?.querySelectorAll<HTMLElement>('.fade-in-section').forEach((el) => {
    observer?.observe(el)
  })
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})

/** FAQ (simple in-component data so no store dependency) */
const faqQuery = ref('')
const faqs = ref<Array<{ q: string; a: string }>>([
  {
    q: 'What if a fan stops paying?',
    a: 'Creator view » Their timelocked token never unlocks for you. Fundstr flags the user as “Expired” and hides future paid posts. Fan view » You simply don’t renew. No recurring pull, no surprise charges.'
  },
  {
    q: 'Can I withdraw to a Lightning wallet?',
    a: 'Yes. Go to Wallet → Send → Lightning Invoice, paste the invoice from any external wallet; Fundstr melts the tokens at the mint and pays it.'
  },
  {
    q: 'How private is this really?',
    a: `<ul class="list-disc pl-6 space-y-1">
          <li>Mints see withdraw/redeem events but cannot correlate them.</li>
          <li>Nostr chats are E2E encrypted; Nutzaps use P2PK so only the intended receiver can claim them.</li>
          <li>Choose different mints or buckets to compartmentalise further.</li>
        </ul>`
  },
  {
    q: 'What exactly is Cashu and how is it different from regular Bitcoin or Lightning wallets?',
    a: 'Cashu uses Chaumian e‑cash, allowing the mint to issue anonymised tokens. Unlike typical wallets, your transactions never appear on the blockchain, and the mint cannot link where your tokens are spent.'
  },
  {
    q: 'Do I need to trust a mint, and what happens if a mint goes offline?',
    a: 'A mint is required to issue and redeem tokens. If it disappears, any tokens it issued become unusable. Reduce risk: hold small balances, spread funds across multiple mints, and withdraw/swap if you suspect a mint might fail.'
  },
  {
    q: 'How can I back up or restore my wallet?',
    a: 'During setup you can generate a BIP‑39 seed. Record it safely; if your device is lost, reinstall the app, enter the seed, and reconnect to your mints to restore unspent tokens.'
  },
  {
    q: 'What are “Buckets” and why would I use them?',
    a: 'Buckets act like sub‑accounts. Allocate tokens to categories (e.g., savings, subscriptions) and move funds instantly—useful for budgeting or keeping project funds separate.'
  },
  {
    q: 'How does the Nostr integration work?',
    a: 'The app can generate or import a Nostr key pair, connect to relays, and send encrypted DMs. This enables token transfers and tipping directly through Nostr events.'
  },
  {
    q: 'What are Nutzaps and how do I receive them?',
    a: 'Nutzaps let users send Cashu tokens as Nostr “zap” events. Publish your NIP‑61 profile (the app guides you), and others can tip you using ecash locked to your Nostr wallet key.'
  },
  {
    q: 'Can I connect the wallet to other Nostr‑enabled apps?',
    a: 'Yes. Nostr Wallet Connect (NWC) provides a QR code and secret key. Pair it with supported apps; they can request payments or signatures that you approve inside the wallet.'
  },
  {
    q: 'Are there any fees for using Cashu tokens?',
    a: 'Sending tokens between users is free. Fees may apply when minting/melting via Lightning, depending on the mint’s policy and Lightning network costs.'
  },
  {
    q: 'Does the app work offline?',
    a: 'You can view balances, buckets, and message history offline. Creating/redeeming tokens, chatting, and nutzap processing require connectivity to mints and relays.'
  },
  {
    q: 'Is the code open source and can I run it myself?',
    a: 'Yes. The whole project is MIT‑licensed. You can review, fork, self‑host, and even run your own mint and point the wallet at it.'
  }
])

const filteredFaqs = computed(() => {
  const q = faqQuery.value.trim().toLowerCase()
  if (!q) return faqs.value
  return faqs.value.filter((f) => f.q.toLowerCase().includes(q))
})

/** PWA install helper: give useful feedback even if the prompt is unavailable */
function handleInstallPwa() {
  // If you already capture the beforeinstallprompt event elsewhere, you can store it
  // as window.deferredPWAInstallPrompt and trigger here. Otherwise provide guidance.
  const promptEvt: any = (window as any).deferredPWAInstallPrompt
  if (promptEvt && typeof promptEvt.prompt === 'function') {
    promptEvt.prompt()
    promptEvt.userChoice?.then(() => ((window as any).deferredPWAInstallPrompt = null))
  } else {
    $q.notify({
      message:
        'To install: use your browser menu → “Install app” / “Add to Home Screen”.',
      color: 'primary',
      icon: 'download'
    })
  }
}
</script>

<style scoped>
/* ---------- Local theme tokens (scoped so they don't leak) ---------- */
.about-theme {
  --surface-1: #0a0d15;
  --surface-2: #141824;
  --text-1: #e0e7ff;
  --accent-500: #8b5cf6; /* violet-500 */
  --accent-200: #a855f7; /* violet-400/500 mix */
  --accent-rgb: 168, 85, 247;
  color: var(--text-1);
}
.about-theme:not(.dark) {
  --surface-1: #ffffff;
  --surface-2: #f3f4f6;
  --text-1: #0f172a;
  --accent-500: #7c3aed;
  --accent-200: #8b5cf6;
  --accent-rgb: 139, 92, 246;
  color: var(--text-1);
}

/* ---------- Decorative helpers ---------- */
.gradient-text {
  background: linear-gradient(90deg, #a855f7, #4f46e5, #0ea5e9);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.fade-in-section {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.8s ease-out, transform 0.8s ease-out;
}
.fade-in-section.is-visible {
  opacity: 1;
  transform: none;
}

blockquote {
  border-left: 4px solid var(--accent-500);
  padding-left: 1.5rem;
  font-style: italic;
}

/* ---------- Cards / Links / Badges ---------- */
.alpha-warning {
  background-color: var(--surface-2);
  border: 1px solid rgba(var(--accent-rgb), 0.4);
  border-radius: 1rem;
  padding: 1.25rem 1.5rem;
  box-shadow: 0 0 20px rgba(var(--accent-rgb), 0.16);
}

.interactive-card {
  background-color: var(--surface-2);
  border: 1px solid rgba(var(--accent-rgb), 0.18);
  border-radius: 1rem;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.24);
  transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
}
.interactive-card:hover {
  transform: translateY(-6px);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.28);
  border-color: rgba(var(--accent-rgb), 0.35);
}

.row-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  text-decoration: none;
}
.row-link:hover {
  text-decoration: underline;
}

/* small category pill */
.badge {
  display: inline-block;
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 700;
  border-radius: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.badge-accent {
  background-color: rgba(var(--accent-rgb), 0.15);
  color: var(--accent-500);
  border: 1px solid var(--accent-200);
}

/* CTA band + buttons */
.cta-band {
  background: linear-gradient(
    90deg,
    rgba(var(--accent-rgb), 0.10),
    rgba(var(--accent-rgb), 0.05)
  );
}
.btn-accent-solid {
  background-color: var(--accent-500);
}
.btn-accent-solid:hover {
  filter: brightness(0.92);
}
.btn-accent-outline {
  color: var(--accent-500);
  border: 2px solid var(--accent-500);
}
.btn-accent-outline:hover {
  background-color: var(--accent-500);
  color: white;
}

/* How-it-works connector lines */
#how-it-works .how-step {
  position: relative;
}
@media (max-width: 767px) {
  #how-it-works .how-step:not(:last-child)::after {
    content: "";
    position: absolute;
    left: 50%;
    bottom: -20px;
    width: 2px;
    height: 40px;
    transform: translateX(-50%);
    background-color: currentColor;
    opacity: 0.25;
  }
}
@media (min-width: 768px) {
  #how-it-works .how-step:not(:last-child)::after {
    content: "";
    position: absolute;
    top: 50%;
    right: -20px;
    width: 40px;
    height: 2px;
    transform: translateY(-50%);
    background-color: currentColor;
    opacity: 0.25;
  }
}

/* Inputs */
input[type="text"] {
  background-color: var(--surface-2);
  border-color: rgba(var(--accent-rgb), 0.22);
  color: var(--text-1);
}
input[type="text"]:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.35);
  border-color: rgba(var(--accent-rgb), 0.35);
}

/* External link look */
.ext-link {
  text-decoration: underline;
}
</style>

