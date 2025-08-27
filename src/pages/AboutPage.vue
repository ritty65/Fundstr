<template>
  <div class="bg-surface1 text-text1 font-inter antialiased min-h-dvh">
    <main class="mx-auto max-w-screen-xl px-4 lg:px-8">
      <!-- Hero + Alpha warning -->
      <section id="hero" class="pt-24 md:pt-32 pb-8 opacity-0 translate-y-5 transition-all duration-700" data-animate>
        <div class="grid lg:grid-cols-2 gap-8 items-center">
          <div class="text-center lg:text-left">
            <h1 class="text-5xl md:text-6xl font-extrabold mb-4 leading-tight">
              About
              <span class="bg-gradient-to-r from-accent-200 via-indigo-600 to-sky-500 bg-clip-text text-transparent">
                Fundstr
              </span>
            </h1>
            <p class="text-lg md:text-xl max-w-prose mx-auto lg:mx-0">
              A privacy-first Bitcoin wallet, social chat, and creator-monetisation hub built on the open-source Cashu ecash protocol and the decentralised Nostr network.
            </p>
          </div>

          <div class="lg:flex lg:justify-end">
            <div class="bg-surface2 border border-accent-200 text-text1 rounded-2xl p-6 shadow-glow flex items-start gap-3" role="alert">
              <span class="text-3xl" aria-hidden="true">⚠️</span>
              <p class="text-sm">
                Fundstr is experimental alpha software. Features may break or change, and loss of funds is possible. Use only small amounts you can afford to lose.
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- Vision -->
      <section id="vision" class="py-12 md:py-20 opacity-0 translate-y-5 transition-all duration-700" data-animate>
        <div class="grid lg:grid-cols-2 gap-8 items-center">
          <div class="text-center lg:text-left">
            <h2 class="text-3xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-accent-200 via-indigo-600 to-sky-500 bg-clip-text text-transparent">
              Your Money, Your Network
            </h2>
            <p class="text-lg md:text-xl max-w-prose mx-auto lg:mx-0">
              We believe in a world where your financial life and social interactions are truly your own. Fundstr is an experiment in creating a parallel, peer‑to‑peer economy—free from corporate gatekeepers, surveillance, and unpredictable fees. It’s a gateway to a more sovereign way of connecting and transacting.
            </p>
          </div>

          <ul class="list-disc list-inside space-y-2 text-left text-lg lg:pl-8">
            <li>Private payments</li>
            <li>Open protocols</li>
            <li>No gatekeepers</li>
            <li>Low fees</li>
          </ul>
        </div>
      </section>

      <!-- Site Overview (clustered) -->
      <section id="site-overview" class="py-12 md:py-20 opacity-0 translate-y-5 transition-all duration-700" data-animate>
        <h2 class="text-3xl md:text-5xl font-bold mb-12 text-center bg-gradient-to-r from-accent-200 via-indigo-600 to-sky-500 bg-clip-text text-transparent">
          Site Overview
        </h2>

        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 text-left">
          <!-- Money -->
          <article class="bg-surface2 border border-accent-200/40 rounded-2xl shadow-lg hover:-translate-y-2 hover:shadow-2xl transition p-6 flex flex-col h-full">
            <header class="flex items-center gap-3 mb-3">
              <span class="text-2xl text-accent-200" aria-hidden="true">💰</span>
              <h3 class="font-semibold text-xl">Money</h3>
            </header>
            <ul class="space-y-2 text-base">
              <li><a href="#" class="flex items-center gap-2 hover:underline"><span class="text-accent-200" aria-hidden="true">💳</span> <span>Wallet</span></a></li>
              <li><a href="#" class="flex items-center gap-2 hover:underline"><span class="text-accent-200" aria-hidden="true">📦</span> <span>Buckets</span></a></li>
              <li><a href="#" class="flex items-center gap-2 hover:underline"><span class="text-accent-200" aria-hidden="true">📄</span> <span>Subscriptions</span></a></li>
            </ul>
          </article>

          <!-- Creators -->
          <article class="bg-surface2 border border-accent-200/40 rounded-2xl shadow-lg hover:-translate-y-2 hover:shadow-2xl transition p-6 flex flex-col h-full">
            <header class="flex items-center gap-3 mb-3">
              <span class="text-2xl text-accent-200" aria-hidden="true">⭐</span>
              <h3 class="font-semibold text-xl">Creators</h3>
            </header>
            <ul class="space-y-2 text-base">
              <li><a href="#" class="flex items-center gap-2 hover:underline"><span class="text-accent-200" aria-hidden="true">🔍</span> <span>Find Creators</span></a></li>
              <li><a href="#" class="flex items-center gap-2 hover:underline"><span class="text-accent-200" aria-hidden="true">👩‍🎨</span> <span>Creator Hub</span></a></li>
              <li><a href="#" class="flex items-center gap-2 hover:underline"><span class="text-accent-200" aria-hidden="true">👤</span> <span>My Profile</span></a></li>
            </ul>
          </article>

          <!-- Comms -->
          <article class="bg-surface2 border border-accent-200/40 rounded-2xl shadow-lg hover:-translate-y-2 hover:shadow-2xl transition p-6 flex flex-col h-full">
            <header class="flex items-center gap-3 mb-3">
              <span class="text-2xl text-accent-200" aria-hidden="true">💬</span>
              <h3 class="font-semibold text-xl">Comms</h3>
            </header>
            <ul class="space-y-2 text-base">
              <li><a href="#" class="flex items-center gap-2 hover:underline"><span class="text-accent-200" aria-hidden="true">💬</span> <span>Nostr Messenger</span></a></li>
              <li><a href="#" class="flex items-center gap-2 hover:underline"><span class="text-accent-200" aria-hidden="true">🔑</span> <span>Nostr Login</span></a></li>
            </ul>
          </article>

          <!-- System -->
          <article class="bg-surface2 border border-accent-200/40 rounded-2xl shadow-lg hover:-translate-y-2 hover:shadow-2xl transition p-6 flex flex-col h-full">
            <header class="flex items-center gap-3 mb-3">
              <span class="text-2xl text-accent-200" aria-hidden="true">⚙️</span>
              <h3 class="font-semibold text-xl">System</h3>
            </header>
            <ul class="space-y-2 text-base">
              <li><a href="#" class="flex items-center gap-2 hover:underline"><span class="text-accent-200" aria-hidden="true">⚙️</span> <span>Settings</span></a></li>
              <li><a href="#" class="flex items-center gap-2 hover:underline"><span class="text-accent-200" aria-hidden="true">🔄</span> <span>Restore</span></a></li>
              <li><a href="#" class="flex items-center gap-2 hover:underline"><span class="text-accent-200" aria-hidden="true">⚠️</span> <span>Already Running</span></a></li>
              <li><a href="#" class="flex items-center gap-2 hover:underline"><span class="text-accent-200" aria-hidden="true">ℹ️</span> <span>Welcome</span></a></li>
              <li><a href="#" class="flex items-center gap-2 hover:underline"><span class="text-accent-200" aria-hidden="true">⚖️</span> <span>Terms</span></a></li>
            </ul>
          </article>
        </div>
      </section>

      <!-- How Ecash Works (3-step connected rail) -->
      <section id="how-it-works" class="py-12 md:py-20 opacity-0 translate-y-5 transition-all duration-700" data-animate>
        <h2 class="text-3xl md:text-5xl font-bold mb-6 text-center bg-gradient-to-r from-accent-200 via-indigo-600 to-sky-500 bg-clip-text text-transparent">
          How Ecash Works
        </h2>
        <p class="text-lg md:text-xl mb-12 max-w-prose mx-auto text-center">
          The loop is simple: Bitcoin in → private e‑cash out → social payments everywhere.
        </p>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          <div class="relative bg-surface2 border border-accent-200/40 rounded-2xl shadow-lg hover:-translate-y-2 hover:shadow-2xl transition p-6 flex flex-col items-center text-center h-full">
            <span class="mb-4 text-4xl text-accent-200" aria-hidden="true">₿</span>
            <h3 class="font-bold text-xl mb-1">Your Bitcoin</h3>
            <p class="text-base">From any wallet</p>
            <!-- connectors -->
            <span class="hidden md:block absolute top-1/2 right-[-20px] h-[2px] w-10 -translate-y-1/2 bg-white/30 md:last:hidden"></span>
            <span class="md:hidden block absolute bottom-[-20px] left-1/2 w-[2px] h-10 -translate-x-1/2 bg-white/30 last:hidden"></span>
          </div>

          <div class="relative bg-surface2 border border-accent-200/40 rounded-2xl shadow-lg hover:-translate-y-2 hover:shadow-2xl transition p-6 flex flex-col items-center text-center h-full">
            <span class="mb-4 text-4xl text-accent-200" aria-hidden="true">🏦</span>
            <h3 class="font-bold text-xl mb-1">The Mint</h3>
            <p class="text-base">Issues ecash tokens</p>
            <span class="hidden md:block absolute top-1/2 right-[-20px] h-[2px] w-10 -translate-y-1/2 bg-white/30 md:last:hidden"></span>
            <span class="md:hidden block absolute bottom-[-20px] left-1/2 w-[2px] h-10 -translate-x-1/2 bg-white/30 last:hidden"></span>
          </div>

          <div class="relative bg-surface2 border border-accent-200/40 rounded-2xl shadow-lg hover:-translate-y-2 hover:shadow-2xl transition p-6 flex flex-col items-center text-center h-full">
            <span class="mb-4 text-4xl text-accent-200" aria-hidden="true">👛</span>
            <h3 class="font-bold text-xl mb-1">Fundstr Wallet</h3>
            <p class="text-base">Spend privately</p>
          </div>
        </div>
      </section>

      <!-- Built for the Sovereign Individual (2x2 tiles) -->
      <section id="who-for" class="py-12 md:py-20 opacity-0 translate-y-5 transition-all duration-700" data-animate>
        <h2 class="text-3xl md:text-5xl font-bold mb-12 text-center bg-gradient-to-r from-accent-200 via-indigo-600 to-sky-500 bg-clip-text text-transparent">
          Built for the Sovereign Individual
        </h2>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div class="bg-surface2 border border-accent-200/40 rounded-2xl shadow-lg hover:-translate-y-2 hover:shadow-2xl transition p-6 flex flex-col items-center text-center h-full">
            <span class="inline-block px-3 py-1 text-xs font-bold uppercase tracking-wide rounded-full bg-accent-200/15 text-accent-500 border border-accent-200/60 mb-2">Creators</span>
            <span class="mb-4 text-4xl text-accent-200" aria-hidden="true">🎨</span>
            <h3 class="font-bold text-xl mb-2">Content Creators</h3>
            <p class="text-base">Monetize your audience directly, free from de‑platforming and high fees.</p>
          </div>

          <div class="bg-surface2 border border-accent-200/40 rounded-2xl shadow-lg hover:-translate-y-2 hover:shadow-2xl transition p-6 flex flex-col items-center text-center h-full">
            <span class="inline-block px-3 py-1 text-xs font-bold uppercase tracking-wide rounded-full bg-accent-200/15 text-accent-500 border border-accent-200/60 mb-2">Privacy</span>
            <span class="mb-4 text-4xl text-accent-200" aria-hidden="true">🛡️</span>
            <h3 class="font-bold text-xl mb-2">Privacy Advocates</h3>
            <p class="text-base">Transact with confidence that your financial life isn't being tracked.</p>
          </div>

          <div class="bg-surface2 border border-accent-200/40 rounded-2xl shadow-lg hover:-translate-y-2 hover:shadow-2xl transition p-6 flex flex-col items-center text-center h-full">
            <span class="inline-block px-3 py-1 text-xs font-bold uppercase tracking-wide rounded-full bg-accent-200/15 text-accent-500 border border-accent-200/60 mb-2">Nostr Users</span>
            <span class="mb-4 text-4xl text-accent-200" aria-hidden="true">🔗</span>
            <h3 class="font-bold text-xl mb-2">Nostr Users</h3>
            <p class="text-base">Upgrade your zaps to be truly private and integrate payments seamlessly.</p>
          </div>

          <div class="bg-surface2 border border-accent-200/40 rounded-2xl shadow-lg hover:-translate-y-2 hover:shadow-2xl transition p-6 flex flex-col items-center text-center h-full">
            <span class="inline-block px-3 py-1 text-xs font-bold uppercase tracking-wide rounded-full bg-accent-200/15 text-accent-500 border border-accent-200/60 mb-2">Global Citizens</span>
            <span class="mb-4 text-4xl text-accent-200" aria-hidden="true">🌍</span>
            <h3 class="font-bold text-xl mb-2">Global Citizens</h3>
            <p class="text-base">Move value across borders instantly, without relying on traditional banking.</p>
          </div>
        </div>
      </section>

      <!-- Trust Through Transparency -->
      <section id="trust" class="py-12 md:py-20 opacity-0 translate-y-5 transition-all duration-700" data-animate>
        <h2 class="text-3xl md:text-5xl font-bold mb-12 text-center bg-gradient-to-r from-accent-200 via-indigo-600 to-sky-500 bg-clip-text text-transparent">
          Trust Through Transparency
        </h2>

        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8">
          <details class="bg-surface2 border border-accent-200/40 rounded-2xl shadow-lg p-6 text-left h-full">
            <summary class="cursor-pointer">
              <span class="block mb-4 text-4xl text-accent-200" aria-hidden="true">💻</span>
              <span class="block font-bold text-xl mb-2">Open Source & Verifiable</span>
              <span class="block text-base">Fundstr is built on open‑source code. We invite you to inspect, verify, and contribute. Transparency is our core principle.</span>
            </summary>
            <div class="mt-4 text-sm space-y-2">
              <p>Anyone can audit our wallet and mint implementations or even reproduce the exact binaries we ship.</p>
              <ul class="list-disc pl-6 space-y-1">
                <li><a href="#" target="_blank" rel="noopener" class="underline">Open Source Definition</a></li>
                <li><a href="#" target="_blank" rel="noopener" class="underline">Cashu organisation on GitHub</a></li>
                <li><a href="#" target="_blank" rel="noopener" class="underline">Build provenance and reproducible builds</a></li>
                <li><a href="#" target="_blank" rel="noopener" class="underline">Telegram's verifiable builds programme</a></li>
              </ul>
            </div>
          </details>

          <details class="bg-surface2 border border-accent-200/40 rounded-2xl shadow-lg p-6 text-left h-full">
            <summary class="cursor-pointer">
              <span class="block mb-4 text-4xl text-accent-200" aria-hidden="true">🔑</span>
              <span class="block font-bold text-xl mb-2">You Hold the Keys</span>
              <span class="block text-base">You are the sole holder of your ecash tokens and Nostr identity. Mints act as custodians for the underlying Bitcoin, but only you can spend your ecash.</span>
            </summary>
            <div class="mt-4 text-sm space-y-2">
              <p>Owning your private key means only you can authorise payments or posts.</p>
              <ul class="list-disc pl-6 space-y-1">
                <li><a href="#" target="_blank" rel="noopener" class="underline">CoinDesk: What is crypto custody?</a></li>
                <li><a href="#" target="_blank" rel="noopener" class="underline">Investopedia: Private keys explained</a></li>
                <li><a href="#" target="_blank" rel="noopener" class="underline">Nostr Implementation Possibilities (NIPs)</a></li>
              </ul>
            </div>
          </details>

          <details class="bg-surface2 border border-accent-200/40 rounded-2xl shadow-lg p-6 text-left h-full">
            <summary class="cursor-pointer">
              <span class="block mb-4 text-4xl text-accent-200" aria-hidden="true">🛡️</span>
              <span class="block font-bold text-xl mb-2">Unbreakable Privacy</span>
              <span class="block text-base">Thanks to Chaumian blind signatures, mints cannot link your deposits to your withdrawals. Your spending habits remain completely private.</span>
            </summary>
            <div class="mt-4 text-sm space-y-2">
              <p>Blind signatures break the trail between your deposits and spends, even from the mint itself.</p>
              <ul class="list-disc pl-6 space-y-1">
                <li><a href="#" target="_blank" rel="noopener" class="underline">David Chaum's original paper</a></li>
                <li><a href="#" target="_blank" rel="noopener" class="underline">Rootstock: blind signatures explainer</a></li>
                <li><a href="#" target="_blank" rel="noopener" class="underline">Building intuition for Cashu's scheme</a></li>
                <li><a href="#" target="_blank" rel="noopener" class="underline">Buckets of blind signatures</a></li>
                <li><a href="#" target="_blank" rel="noopener" class="underline">Bitcoin Design guide: Cashu overview</a></li>
              </ul>
            </div>
          </details>

          <details class="bg-surface2 border border-accent-200/40 rounded-2xl shadow-lg p-6 text-left h-full">
            <summary class="cursor-pointer">
              <span class="block mb-4 text-4xl text-accent-200" aria-hidden="true">👛</span>
              <span class="block font-bold text-xl mb-2">Mint Diversification</span>
              <span class="block text-base">Fundstr supports multiple mints, allowing you to diversify your holdings. Our audit tools will warn you (⚠️) of any unusual mint behavior.</span>
            </summary>
            <div class="mt-4 text-sm space-y-2">
              <p>Spreading tokens across independent mints limits custodial risk.</p>
              <ul class="list-disc pl-6 space-y-1">
                <li><a href="#" target="_blank" rel="noopener" class="underline">Cashu docs: mints</a></li>
                <li><a href="#" target="_blank" rel="noopener" class="underline">Bitcoin Magazine: modular ecosystem</a></li>
                <li><a href="#" target="_blank" rel="noopener" class="underline">Awesome Cashu resources</a></li>
                <li><a href="#" target="_blank" rel="noopener" class="underline">Nasdaq guide: running an ecash mint</a></li>
              </ul>
            </div>
          </details>
        </div>
      </section>

      <!-- FAQ -->
      <section id="faq" class="py-12 md:py-20 opacity-0 translate-y-5 transition-all duration-700" data-animate>
        <h2 class="text-3xl md:text-5xl font-bold mb-12 text-center bg-gradient-to-r from-accent-200 via-indigo-600 to-sky-500 bg-clip-text text-transparent">
          Frequently Asked Questions
        </h2>
        <div class="mb-6 max-w-lg mx-auto">
          <input
            v-model="faqQuery"
            type="text"
            placeholder="Search questions"
            class="w-full p-3 bg-white/10 text-text1 placeholder:text-text1/60 rounded-xl border border-white/20 focus:outline-none focus:ring-2 focus:ring-accent-500"
            aria-label="Search FAQ"
          />
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <details
            v-for="item in filteredFaqs"
            :key="item.q"
            class="bg-surface2 border border-accent-200/40 rounded-2xl shadow-lg p-4 w-full"
          >
            <summary class="cursor-pointer font-semibold text-lg">{{ item.q }}</summary>
            <p v-if="item.a" class="mt-4 text-sm">{{ item.a }}</p>
            <ul v-else class="mt-4 text-sm list-disc pl-6 space-y-1">
              <li v-for="li in item.list" :key="li">{{ li }}</li>
            </ul>
          </details>
        </div>
      </section>
    </main>

    <!-- Community + CTA footer -->
    <footer class="mx-auto max-w-screen-xl px-4 lg:px-8">
      <!-- Community -->
      <section class="py-16 opacity-0 translate-y-5 transition-all duration-700" data-animate>
        <div class="text-center">
          <h2 class="text-3xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-accent-200 via-indigo-600 to-sky-500 bg-clip-text text-transparent">
            Join the Conversation
          </h2>
          <p class="mb-6">
            Follow the project and its creator on Nostr to stay up‑to‑date and connect with the community.
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-accent-500">
            <a href="#" target="_blank" rel="noopener noreferrer" class="bg-surface2 border border-accent-200/40 rounded-2xl shadow-lg p-6 flex flex-col items-center text-center h-full focus:outline-none focus:ring-2 focus:ring-accent-500">
              <span class="mb-2 text-3xl" aria-hidden="true">👤</span>
              <span class="font-semibold">Creator's Profile</span>
              <span class="mt-2" aria-hidden="true">↗️</span>
            </a>

            <a href="#" class="bg-surface2 border border-accent-200/40 rounded-2xl shadow-lg p-6 flex flex-col items-center text-center h-full focus:outline-none focus:ring-2 focus:ring-accent-500">
              <span class="mb-2 text-3xl" aria-hidden="true">💵</span>
              <span class="font-semibold">View KalonAxiarch's Tiers</span>
            </a>
          </div>
        </div>
      </section>

      <!-- Quote -->
      <section class="py-16 opacity-0 translate-y-5 transition-all duration-700" data-animate>
        <div class="max-w-4xl mx-auto text-center">
          <blockquote class="border-l-4 border-accent-500 pl-6 italic">
            Fundstr is powered by open‑source code and an open community. Whether you’re a storyteller earning sats or a fan supporting work you love, we hope this guide helps you navigate every page with confidence — and makes your next payment feel as effortless as a like, comment, or retweet.
          </blockquote>
        </div>
      </section>

      <!-- CTA (gradient band, 3 actions across) -->
      <section id="cta" class="py-16 rounded-2xl bg-gradient-to-r from-accent-200/10 to-accent-200/5 opacity-0 translate-y-5 transition-all duration-700" data-animate>
        <div class="text-center">
          <h2 class="text-3xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-accent-200 via-indigo-600 to-sky-500 bg-clip-text text-transparent">
            Ready to Join the Movement?
          </h2>
          <p class="mb-8">Install the PWA, explore the code, or help fund development.</p>
          <div class="flex flex-col md:flex-row items-center justify-center gap-4">
            <a href="#" class="px-8 py-4 font-bold text-white bg-accent-500 rounded-lg shadow-lg hover:brightness-110 transition">
              Install PWA
            </a>
            <a href="#" class="px-8 py-4 font-bold text-accent-500 border-2 border-accent-500 rounded-lg hover:bg-accent-500 hover:text-white transition">
              View Code
            </a>
            <a href="#" class="px-8 py-4 font-bold text-accent-500 border-2 border-accent-500 rounded-lg hover:bg-accent-500 hover:text-white transition">
              Support Fundstr
            </a>
          </div>
        </div>
      </section>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, computed } from 'vue'

// Small fade-in on scroll using IntersectionObserver
let io: IntersectionObserver | null = null

onMounted(() => {
  const reveal = (el: Element) => {
    el.classList.remove('opacity-0', 'translate-y-5')
    el.classList.add('opacity-100', 'translate-y-0')
  }
  io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          reveal(e.target)
          io?.unobserve(e.target)
        }
      })
    },
    { threshold: 0.1 }
  )
  document.querySelectorAll('[data-animate]').forEach((el) => io!.observe(el))
})

onBeforeUnmount(() => io?.disconnect())

// FAQ data + live search (adds completeness vs. static HTML)
const faqQuery = ref('')

type Faq = { q: string; a?: string; list?: string[] }
const faqs = ref<Faq[]>([
  {
    q: 'What if a fan stops paying?',
    a: 'Creator view » Their timelocked token never unlocks for you. Fundstr flags the user as “Expired” and hides future paid posts. Fan view » You simply don’t renew. No recurring pull, no surprise charges.',
  },
  {
    q: 'Can I withdraw to a Lightning wallet?',
    a: 'Yes. Go to Wallet → Send → Lightning Invoice, paste the invoice from any external wallet; Fundstr melts the tokens at the mint and pays it.',
  },
  {
    q: 'How private is this really?',
    list: [
      'Mints see withdraw/redeem events but cannot correlate them.',
      'Nostr chats are E2E encrypted; Nutzaps use P2PK so only the intended receiver can claim them.',
      'Choose different mints or buckets to compartmentalise further.',
    ],
  },
  {
    q: 'What exactly is Cashu and how is it different from regular Bitcoin or Lightning wallets?',
    a: 'Cashu uses Chaumian e‑cash, allowing the mint to issue anonymized tokens. Unlike typical wallets, your transactions never appear on the blockchain, and the mint cannot link where your tokens are spent.',
  },
  {
    q: 'Do I need to trust a mint, and what happens if a mint goes offline?',
    a: 'A mint is required to issue and redeem tokens. If it disappears, any tokens it issued become unusable. To reduce risk, you can hold small balances, spread funds across multiple mints, and withdraw or swap tokens when you suspect a mint might fail.',
  },
  {
    q: 'How can I back up or restore my wallet?',
    a: 'During setup you can generate a BIP‑39 seed. Record it safely; if your device is lost, reinstall the app, enter the seed, and reconnect to your mints to restore unspent tokens. Without a seed or token export, lost devices mean lost funds.',
  },
  {
    q: 'What are “Buckets” and why would I use them?',
    a: 'Buckets act like sub‑accounts. You can allocate tokens to categories (e.g., savings, subscriptions) and move funds between buckets instantly, which helps with budgeting or keeping project funds separate.',
  },
  {
    q: 'How does the Nostr integration work?',
    a: 'The app can generate or import a Nostr key pair, connect to relays, and send encrypted DMs. This enables token transfers and tipping directly through Nostr events without exposing invoices or addresses.',
  },
  {
    q: 'What are Nutzaps and how do I receive them?',
    a: 'Nutzaps let users send Cashu tokens as Nostr “zap” events. Publish your NIP‑61 profile (the app guides you), and others can tip you using ecash locked to your Nostr wallet key, keeping the payment private yet publicly verifiable.',
  },
  {
    q: 'Can I connect the wallet to other Nostr‑enabled apps?',
    a: 'Yes. Nostr Wallet Connect (NWC) provides a QR code and secret key. Pair it with supported apps, and they can request payments or signatures through Nostr events that you approve inside the wallet.',
  },
  {
    q: 'Are there any fees for using Cashu tokens?',
    a: 'Sending tokens between users is free. Fees may apply when minting or melting tokens via Lightning, depending on the mint’s policy and Lightning network costs. The app shows mint‑specific fees before you confirm a transaction.',
  },
  {
    q: 'Does the app work offline?',
    a: 'You can view balances, buckets, and message history offline. Creating or redeeming tokens, chatting, and nutzap processing require an internet connection to reach the mint and Nostr relays.',
  },
  {
    q: 'Is the code open source and can I run it myself?',
    a: 'Yes. The entire project is MIT‑licensed. You can review, fork, or self‑host the repository. Advanced users can also run their own mint and point the wallet at it for full control over issuance and redemption.',
  },
])

const filteredFaqs = computed(() =>
  faqs.value.filter((f) => f.q.toLowerCase().includes(faqQuery.value.toLowerCase()))
)
</script>

<!-- No <style> block; all styling is with Tailwind utilities. Ensure Tailwind CDN + config live in index.html. -->
