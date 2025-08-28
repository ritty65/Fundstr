<template>
  <q-page class="about theme" :class="{ dark: isDark }">
    <div ref="root" class="container">
      <!-- Hero -->
      <section class="section fade" id="hero">
        <div class="hero-grid">
          <div class="hero-copy">
            <h1 class="h1">About <span class="grad">Fundstr</span></h1>
            <p class="lead">
              A privacy-first Bitcoin wallet, social chat, and creator-monetisation hub
              built on the open-source Cashu ecash protocol and the decentralised Nostr network.
            </p>
          </div>
          <div class="hero-alert">
            <div class="alpha">
              <span aria-hidden="true" class="alpha-icon">⚠️</span>
              <p>
                Fundstr is experimental alpha software. Features may break or change,
                and loss of funds is possible. Use only small amounts you can afford to lose.
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- Vision -->
      <section class="section fade" id="vision">
        <div class="two-col">
          <div>
            <h2 class="h2 grad">Your Money, Your Network</h2>
            <p class="lead">
              We believe in a world where your financial life and social interactions are truly your own.
              Fundstr is an experiment in creating a parallel, peer-to-peer economy—free from corporate
              gatekeepers, surveillance, and unpredictable fees.
            </p>
          </div>
          <q-list dense class="text-1">
            <q-item class="q-py-sm">
              <q-item-section avatar>
                <q-icon name="lock" style="color: var(--accent-500)" />
              </q-item-section>
              <q-item-section>Private payments</q-item-section>
            </q-item>
            <q-item class="q-py-sm">
              <q-item-section avatar>
                <q-icon name="public" style="color: var(--accent-500)" />
              </q-item-section>
              <q-item-section>Open protocols</q-item-section>
            </q-item>
            <q-item class="q-py-sm">
              <q-item-section avatar>
                <q-icon name="block" style="color: var(--accent-500)" />
              </q-item-section>
              <q-item-section>No gatekeepers</q-item-section>
            </q-item>
            <q-item class="q-py-sm">
              <q-item-section avatar>
                <q-icon name="sell" style="color: var(--accent-500)" />
              </q-item-section>
              <q-item-section>Low fees</q-item-section>
            </q-item>
          </q-list>
        </div>
      </section>

      <!-- Site Overview -->
      <section class="section fade" id="site-overview">
        <h2 class="h2 grad center">Site Overview</h2>
        <div class="cards cards--4">
          <article class="card">
            <header class="card-head"><span class="emj">💰</span><h3>Money</h3></header>
            <ul class="links">
              <li><router-link to="/wallet"><span class="emj">💳</span>Wallet</router-link></li>
              <li><router-link to="/buckets"><span class="emj">📦</span>Buckets</router-link></li>
              <li><router-link to="/subscriptions"><span class="emj">📄</span>Subscriptions</router-link></li>
            </ul>
          </article>

          <article class="card">
            <header class="card-head"><span class="emj">⭐</span><h3>Creators</h3></header>
            <ul class="links">
              <li><router-link to="/find-creators"><span class="emj">🔍</span>Find Creators</router-link></li>
              <li><router-link to="/creator-hub"><span class="emj">👩‍🎨</span>Creator Hub</router-link></li>
              <li><router-link to="/my-profile"><span class="emj">👤</span>My Profile</router-link></li>
            </ul>
          </article>

          <article class="card">
            <header class="card-head"><span class="emj">💬</span><h3>Comms</h3></header>
            <ul class="links">
              <li><router-link to="/nostr-messenger"><span class="emj">💬</span>Nostr Messenger</router-link></li>
              <li><router-link to="/nostr-login"><span class="emj">🔑</span>Nostr Login</router-link></li>
            </ul>
          </article>

          <article class="card">
            <header class="card-head"><span class="emj">⚙️</span><h3>System</h3></header>
            <ul class="links">
              <li><router-link to="/settings"><span class="emj">⚙️</span>Settings</router-link></li>
              <li><router-link to="/restore"><span class="emj">🔄</span>Restore</router-link></li>
              <li><router-link to="/already-running"><span class="emj">⚠️</span>Already Running</router-link></li>
              <li><router-link to="/welcome"><span class="emj">ℹ️</span>Welcome</router-link></li>
              <li><router-link to="/terms"><span class="emj">⚖️</span>Terms</router-link></li>
            </ul>
          </article>
        </div>
      </section>

      <!-- How it works -->
      <section class="section fade" id="how-it-works">
        <h2 class="h2 grad center">How Ecash Works</h2>
        <p class="lead center">Bitcoin in → private e-cash out → social payments everywhere.</p>
        <div class="cards cards--3 rail">
          <div class="card step"><span class="emj xl">₿</span><h3>Your Bitcoin</h3><p>From any wallet</p></div>
          <div class="card step"><span class="emj xl">🏦</span><h3>The Mint</h3><p>Issues ecash tokens</p></div>
          <div class="card step"><span class="emj xl">👛</span><h3>Fundstr Wallet</h3><p>Spend privately</p></div>
        </div>
      </section>

      <!-- For whom -->
      <section class="section fade" id="who-for">
        <h2 class="h2 grad center">Built for the Sovereign Individual</h2>
        <div class="cards cards--2">
          <div class="card tcenter"><span class="pill">Creators</span><span class="emj xl">🎨</span><h3>Content Creators</h3><p>Monetize your audience directly, free from de-platforming and high fees.</p></div>
          <div class="card tcenter"><span class="pill">Privacy</span><span class="emj xl">🛡️</span><h3>Privacy Advocates</h3><p>Transact with confidence that your financial life isn't being tracked.</p></div>
          <div class="card tcenter"><span class="pill">Nostr Users</span><span class="emj xl">🔗</span><h3>Nostr Users</h3><p>Upgrade your zaps to be truly private and integrate payments seamlessly.</p></div>
          <div class="card tcenter"><span class="pill">Global Citizens</span><span class="emj xl">🌍</span><h3>Global Citizens</h3><p>Move value across borders instantly, without relying on traditional banking.</p></div>
        </div>
      </section>

      <!-- Trust -->
      <section class="section fade" id="trust">
        <h2 class="h2 grad center">Trust Through Transparency</h2>
        <div class="cards cards--4">
          <details class="card">
            <summary><span class="emj xl">💻</span><h3>Open Source &amp; Verifiable</h3><p>Fundstr is open-source. Inspect, verify, and contribute.</p></summary>
            <div class="detail">
              <p>Audit our wallet & mint implementations or reproduce our builds.</p>
              <ul class="bullet">
                <li><a class="ext" href="https://opensource.org/osd" target="_blank" rel="noopener">Open Source Definition</a></li>
                <li><a class="ext" href="https://github.com/cashubtc" target="_blank" rel="noopener">Cashu on GitHub</a></li>
                <li><a class="ext" href="https://delvingbitcoin.org/t/building-intuition-for-the-cashu-blind-signature-scheme/506" target="_blank" rel="noopener">Cashu blind signature scheme</a></li>
              </ul>
            </div>
          </details>

          <details class="card">
            <summary><span class="emj xl">🔑</span><h3>You Hold the Keys</h3><p>You control your ecash tokens and Nostr identity.</p></summary>
            <div class="detail">
              <p>Only you can authorise payments or posts.</p>
              <ul class="bullet">
                <li><a class="ext" href="https://www.coindesk.com/learn/what-is-crypto-custody" target="_blank" rel="noopener">What is crypto custody?</a></li>
                <li><a class="ext" href="https://github.com/nostr-protocol/nips" target="_blank" rel="noopener">Nostr NIPs</a></li>
              </ul>
            </div>
          </details>

          <details class="card">
            <summary><span class="emj xl">🛡️</span><h3>Unbreakable Privacy</h3><p>Chaumian blind signatures de-link deposits from withdrawals.</p></summary>
            <div class="detail">
              <ul class="bullet">
                <li><a class="ext" href="https://bitcoin.design/guide/how-it-works/ecash/cashu/" target="_blank" rel="noopener">Bitcoin Design Guide: Cashu</a></li>
                <li><a class="ext" href="https://blog.cashu.space/buckets-of-blind-signatures/" target="_blank" rel="noopener">Buckets of blind signatures</a></li>
              </ul>
            </div>
          </details>

          <details class="card">
            <summary><span class="emj xl">👛</span><h3>Mint Diversification</h3><p>Use multiple mints and watch for odd behaviour.</p></summary>
            <div class="detail">
              <ul class="bullet">
                <li><a class="ext" href="https://docs.cashu.space/mints" target="_blank" rel="noopener">Cashu docs: mints</a></li>
                <li><a class="ext" href="https://github.com/cashubtc/awesome-cashu" target="_blank" rel="noopener">Awesome Cashu</a></li>
              </ul>
            </div>
          </details>
        </div>
      </section>

      <!-- FAQ -->
      <section class="section fade" id="faq">
        <h2 class="h2 grad center">Frequently Asked Questions</h2>

        <div class="faq-search">
          <input
            v-model="faqQuery"
            class="input"
            type="text"
            placeholder="Search questions"
            aria-label="Search FAQ"
          />
        </div>

        <div class="cards cards--3">
          <details v-for="(f, i) in filteredFaqs" :key="i" class="card">
            <summary class="faq-q">{{ f.q }}</summary>
            <div class="faq-a" v-html="f.a"></div>
          </details>
        </div>
      </section>

      <!-- Community + CTA -->
      <section class="section fade" id="community">
        <h2 class="h2 grad center">Join the Conversation</h2>
        <p class="center">Follow the project and its creator on Nostr to connect with the community.</p>

        <div class="cards cards--3">
          <a
            href="https://primal.net/p/nprofile1qqsdndspt5x07jhp5vrs0s4a7z0spwl4v28su0263vdjmwfmumxdygc6lzn8y"
            target="_blank"
            rel="noopener"
            class="card tcenter"
          >
            <span class="emj xl">🧡</span><h3>Fundstr on Nostr</h3><p>Project profile ↗️</p>
          </a>
          <a href="https://primal.net/KalonAxiarch" target="_blank" rel="noopener" class="card tcenter">
            <span class="emj xl">👤</span><h3>Creator’s Profile</h3><p>Primal profile ↗️</p>
          </a>
          <router-link
            to="/find-creators?npub=npub1aljmhjp5tqrw3m60ra7t3u8uqq223d6rdg9q0h76a8djd9m4hmvsmlj82m"
            class="card tcenter"
          >
            <span class="emj xl">💵</span><h3>View KalonAxiarch’s Tiers</h3><p>Support the creator</p>
          </router-link>
        </div>
      </section>

      <section class="section fade cta">
        <h2 class="h2 grad center">Ready to Join the Movement?</h2>
        <p class="center">Install the PWA, explore the code, or help fund development.</p>
        <div class="cta-row">
          <button class="btn solid" @click="installPwa">Install PWA</button>
          <a class="btn outline" href="https://github.com/ritty65/Fundstr" target="_blank" rel="noopener">View Code</a>
          <router-link class="btn outline" to="/creator-hub">Support Fundstr</router-link>
        </div>
      </section>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watchEffect } from 'vue'
import { useQuasar } from 'quasar'

const $q = useQuasar()
const isDark = ref($q.dark.isActive)
watchEffect(() => (isDark.value = $q.dark.isActive))

const root = ref<HTMLElement | null>(null)
let io: IntersectionObserver | null = null

onMounted(() => {
  io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('visible')
        io?.unobserve(e.target)
      }
    })
  }, { threshold: 0.12 })
  root.value?.querySelectorAll<HTMLElement>('.fade').forEach(el => io?.observe(el))
})
onBeforeUnmount(() => io?.disconnect())

const faqQuery = ref('')
const faqs = ref([
  { q: 'What if a fan stops paying?', a: 'Creator view » Their timelocked token never unlocks for you. Fundstr flags the user as “Expired” and hides future paid posts. Fan view » You simply don’t renew. No recurring pull, no surprise charges.' },
  { q: 'Can I withdraw to a Lightning wallet?', a: 'Yes. Wallet → Send → Lightning Invoice. Paste the invoice from any external wallet; Fundstr melts tokens at the mint and pays it.' },
  { q: 'How private is this really?', a: `<ul class="bullet"><li>Mints see withdraw/redeem events but cannot correlate them.</li><li>Nostr chats are E2E encrypted; Nutzaps use P2PK so only the intended receiver can claim them.</li><li>Use different mints/buckets to compartmentalise further.</li></ul>` },
  { q: 'What exactly is Cashu?', a: 'Chaumian e-cash. The mint issues anonymised tokens; transactions never touch the blockchain and the mint cannot link where your tokens are spent.' },
  { q: 'Do I need to trust a mint?', a: 'A mint is required to issue/redeem tokens. Reduce risk by holding small balances, spreading across mints, and withdrawing if a mint looks risky.' },
  { q: 'How can I back up or restore?', a: 'Generate a BIP-39 seed during setup. Keep it safe. Reinstall the app, enter the seed, reconnect to your mints to restore unspent tokens.' },
  { q: 'What are “Buckets”?', a: 'Sub-accounts for budgeting (e.g., savings, subscriptions). Move funds instantly and keep project funds separate.' },
  { q: 'How does the Nostr integration work?', a: 'Generate/import a Nostr keypair, connect to relays, and send encrypted DMs—enabling token transfers and tipping through Nostr events.' },
  { q: 'What are Nutzaps?', a: 'Cashu tokens sent via Nostr “zap” events. Publish your NIP-61 profile and others can tip ecash locked to your Nostr wallet key.' },
  { q: 'Are there any fees?', a: 'Peer-to-peer token sends are free. Fees may apply when minting/melting via Lightning, depending on the mint and network conditions.' },
  { q: 'Does the app work offline?', a: 'Balances/buckets/messages are visible offline. Creating/redeeming tokens, chatting, and Nutzaps require mint/relay connectivity.' },
  { q: 'Is the code open source?', a: 'Yes, MIT-licensed. Review, fork, self-host, even run your own mint and point the wallet at it.' },
])
const filteredFaqs = computed(() => {
  const q = faqQuery.value.trim().toLowerCase()
  return q ? faqs.value.filter(f => f.q.toLowerCase().includes(q)) : faqs.value
})

function installPwa () {
  const evt: any = (window as any).deferredPWAInstallPrompt
  if (evt?.prompt) {
    evt.prompt()
    evt.userChoice?.then(() => ((window as any).deferredPWAInstallPrompt = null))
  } else {
    $q.notify({ message: 'Use your browser menu → “Install app” / “Add to Home Screen”.', color: 'primary', icon: 'download' })
  }
}
</script>

<style scoped>
/* Theme tokens (scoped) */
.theme {
  --s1:#0a0d15; --s2:#141824; --txt:#e0e7ff;
  --ac500:#8b5cf6; --acRGB:168,85,247;
  color:var(--txt);
}
.theme:not(.dark){ --s1:#fff; --s2:#f3f4f6; --txt:#0f172a; --ac500:#7c3aed; --acRGB:139,92,246; color:var(--txt);}

/* Layout */
.container{max-width:1080px; margin:0 auto; padding:0 1.25rem;}
.section{padding:4rem 0;}
.center{text-align:center;}
.tcenter{text-align:center;}

.h1{font-weight:800; font-size:clamp(2.25rem,3vw+1rem,3.5rem); margin:0 0 1rem;}
.h2{font-weight:800; font-size:clamp(1.75rem,2vw+1rem,2.75rem); margin:0 0 1.25rem;}
.lead{font-size:1.1rem; line-height:1.65;}
.grad{background:linear-gradient(90deg,#a855f7,#4f46e5,#0ea5e9); -webkit-background-clip:text; -webkit-text-fill-color:transparent;}

.hero-grid{display:grid; grid-template-columns:1.3fr .7fr; gap:2rem}
@media (max-width: 960px){ .hero-grid{grid-template-columns:1fr; } }

.alpha{background:var(--s2); border:1px solid rgba(var(--acRGB),.35); border-radius:1rem; padding:1rem 1.25rem; box-shadow:0 0 16px rgba(var(--acRGB),.15);}
.alpha-icon{font-size:1.75rem; margin-right:.5rem;}

/* Grid helpers */
.cards{display:grid; gap:1rem}
.cards--2{grid-template-columns:repeat(2,minmax(0,1fr))}
.cards--3{grid-template-columns:repeat(3,minmax(0,1fr))}
.cards--4{grid-template-columns:repeat(4,minmax(0,1fr))}
@media (max-width: 1024px){ .cards--3,.cards--4{grid-template-columns:repeat(2,minmax(0,1fr))} }
@media (max-width: 640px){ .cards--2,.cards--3,.cards--4{grid-template-columns:1fr} }

.two-col{display:grid; grid-template-columns:1fr 1fr; gap:2rem}
@media (max-width: 960px){ .two-col{grid-template-columns:1fr} }

/* Cards */
.card{background:var(--s2); border:1px solid rgba(var(--acRGB),.18); border-radius:1rem; padding:1.25rem; box-shadow:0 4px 10px rgba(0,0,0,.25); transition:transform .2s, box-shadow .2s, border-color .2s;}
.card:hover{transform:translateY(-6px); box-shadow:0 12px 22px rgba(0,0,0,.3); border-color:rgba(var(--acRGB),.35)}
.card-head{display:flex; align-items:center; gap:.5rem; margin-bottom:.5rem}
.links{list-style:none; padding:0; margin:0}
.links a{display:inline-flex; align-items:center; gap:.5rem; text-decoration:none}
.links a:hover{text-decoration:underline}
.emj{font-size:1.25rem}
.emj.xl{font-size:2rem}
.pill{display:inline-block; padding:.35rem .75rem; border-radius:999px; font-weight:700; letter-spacing:.02em; background:rgba(var(--acRGB),.15); color:var(--ac500); border:1px solid var(--ac500); margin-bottom:.5rem}

/* Rail connectors for steps */
.rail .step{position:relative}
@media (min-width:768px){
  .rail .step:not(:last-child)::after{content:""; position:absolute; top:50%; right:-20px; width:40px; height:2px; background:currentColor; opacity:.25; transform:translateY(-50%)}
}
@media (max-width:767px){
  .rail .step:not(:last-child)::after{content:""; position:absolute; left:50%; bottom:-20px; width:2px; height:40px; background:currentColor; opacity:.25; transform:translateX(-50%)}
}

/* FAQ */
.faq-search{max-width:520px; margin:0 auto 1rem}
.input{width:100%; padding:.75rem .9rem; border-radius:.75rem; border:1px solid rgba(var(--acRGB),.28); background:var(--s2); color:var(--txt)}
.input:focus{outline:none; box-shadow:0 0 0 3px rgba(var(--acRGB),.35)}

.faq-q{font-weight:700; font-size:1.05rem}
.faq-a{margin-top:.75rem; font-size:.92rem}
.bullet{list-style:none; display:flex; flex-direction:column; gap:.5rem; padding:0; margin:0}
.bullet li{position:relative; padding-left:1.25rem}
.bullet li::before{content:""; position:absolute; left:0; top:0.6em; width:.5rem; height:.5rem; border-radius:50%; background:var(--ac500); transform:translateY(-50%)}
@media (max-width:600px){ .bullet{align-items:center} }

/* CTA */
.cta{background:linear-gradient(90deg,rgba(var(--acRGB),.10),rgba(var(--acRGB),.05)); border-radius:1rem}
.cta-row{display:flex; gap:.75rem; flex-wrap:wrap; justify-content:center; margin-top:1rem}
.btn{font-weight:700; padding:.9rem 1.25rem; border-radius:.6rem; border:2px solid var(--ac500); text-decoration:none}
.btn.solid{background:var(--ac500); color:#fff}
.btn.outline{color:var(--ac500)}
.btn.outline:hover{background:var(--ac500); color:#fff}

/* Fade in on enter */
.fade{opacity:0; transform:translateY(18px); transition:opacity .6s ease, transform .6s ease}
.fade.visible{opacity:1; transform:none}
</style>
