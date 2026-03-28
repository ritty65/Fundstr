<template>
  <q-page class="about theme" :class="{ dark: isDark }">
    <div ref="root" class="container">
      <!-- Hero -->
      <section class="section fade" id="hero">
        <div class="hero-grid">
          <div class="hero-copy">
            <h1 class="h1">About <span class="grad">Fundstr</span></h1>
            <p class="lead">
              A privacy-first Bitcoin wallet, social chat, and
              creator-monetisation hub built on the Cashu ecash protocol and the
              decentralised Nostr network.
            </p>
            <div class="cta-row hero-cta">
              <router-link class="btn outline" to="/wallet"
                >Launch Wallet</router-link
              >
              <router-link class="btn outline" to="/creator-studio"
                >Creator Studio</router-link
              >
            </div>
            <div class="hero-warning alpha" role="note" aria-live="polite">
              <div class="hero-warning__title">
                <span aria-hidden="true" class="alpha-icon">⚠️</span>
                <span class="hero-warning__label">Alpha release</span>
              </div>
              <p>
                Fundstr is experimental alpha software. Features may break or
                change, and loss of funds is possible. Use only small amounts
                you can afford to lose.
              </p>
            </div>
          </div>
          <aside class="hero-aside" aria-label="Fundstr snapshot">
            <div class="hero-aside__card">
              <h2 class="hero-aside__title">Why build Fundstr?</h2>
              <ul class="hero-stats">
                <li>
                  <span class="hero-stats__metric">100% custody</span>
                  <span class="hero-stats__meta"
                    >You hold your keys, ecash, and identity.</span
                  >
                </li>
                <li>
                  <span class="hero-stats__metric">Built on Cashu + Nostr</span>
                  <span class="hero-stats__meta"
                    >Open protocols powering private payments and social
                    discovery.</span
                  >
                </li>
                <li>
                  <span class="hero-stats__metric">Creator ready</span>
                  <span class="hero-stats__meta"
                    >Tools for tipping, memberships, and direct audience
                    support.</span
                  >
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </section>

      <!-- Section nav -->
      <nav class="section-nav fade" aria-label="About sections">
        <ul class="section-nav__list">
          <li><a class="pill section-nav__link" href="#vision">Vision</a></li>
          <li>
            <a class="pill section-nav__link" href="#site-overview"
              >Site Overview</a
            >
          </li>
          <li>
            <a class="pill section-nav__link" href="#how-it-works"
              >How it Works</a
            >
          </li>
          <li>
            <a class="pill section-nav__link" href="#who-for">Who It's For</a>
          </li>
          <li><a class="pill section-nav__link" href="#trust">Trust</a></li>
          <li><a class="pill section-nav__link" href="#faq">FAQ</a></li>
          <li>
            <a class="pill section-nav__link" href="#community">Community</a>
          </li>
        </ul>
      </nav>

      <!-- Vision -->
      <section class="section fade" id="vision">
        <div class="two-col">
          <div>
            <h2 class="h2 grad">Your Money, Your Network</h2>
            <p class="lead">
              We believe in a world where your financial life and social
              interactions are truly your own. Fundstr is an experiment in
              creating a parallel, peer-to-peer economy—free from corporate
              gatekeepers, surveillance, and unpredictable fees.
            </p>
          </div>
          <div class="feature-grid text-1">
            <div class="feature">
              <q-icon name="lock" class="feature-icon" />
              <span>Private payments</span>
            </div>
            <div class="feature">
              <q-icon name="public" class="feature-icon" />
              <span>Open protocols</span>
            </div>
            <div class="feature">
              <q-icon name="block" class="feature-icon" />
              <span>No gatekeepers</span>
            </div>
            <div class="feature">
              <q-icon name="money_off" class="feature-icon" />
              <span>No fees</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Site Overview -->
      <section class="section fade" id="site-overview">
        <h2 class="h2 grad center">Site Overview</h2>
        <div class="cards cards--4 site-overview-grid">
          <div
            v-for="(card, cardIndex) in siteOverviewCards"
            :key="card.title"
            class="card card--overview"
            role="group"
            :aria-labelledby="`overview-card-${cardIndex}-title`"
            :aria-describedby="`overview-card-${cardIndex}-shortcuts`"
          >
            <component
              :is="card.href ? 'a' : 'router-link'"
              class="card-link__primary"
              :id="`overview-card-${cardIndex}-title`"
              :aria-describedby="`overview-card-${cardIndex}-shortcuts`"
              v-bind="
                card.href
                  ? { href: card.href, target: card.target, rel: card.rel }
                  : { to: card.to }
              "
            >
              <span class="emj">{{ card.emoji }}</span>
              <h3>{{ card.title }}</h3>
            </component>
            <ul class="links" :id="`overview-card-${cardIndex}-shortcuts`">
              <li v-for="item in card.links" :key="item.label">
                <span class="emj">{{ item.emoji }}</span>
                <component
                  :is="item.href ? 'a' : 'router-link'"
                  class="link-text"
                  v-bind="
                    item.href
                      ? { href: item.href, target: item.target, rel: item.rel }
                      : { to: item.to }
                  "
                >
                  {{ item.label }}
                </component>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <!-- How it works -->
      <section class="section fade" id="how-it-works">
        <h2 class="h2 grad center">How Ecash Works</h2>
        <p class="lead center">
          Bitcoin in → private e-cash out → social payments everywhere.
        </p>
        <div class="how-layout">
          <figure class="how-video">
            <video
              class="how-video__player"
              controls
              preload="metadata"
              poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 630'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop offset='0' stop-color='%231a1b2b'/%3E%3Cstop offset='1' stop-color='%232a2547'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect fill='url(%23g)' width='1200' height='630'/%3E%3Cpath d='M180 420h280v40H180zM180 170h280v40H180zM740 170h280v40H740zM740 420h280v40H740z' fill='%233f83f8' opacity='.45'/%3E%3Ccircle cx='600' cy='315' r='120' fill='none' stroke='%23a855f7' stroke-width='32' stroke-dasharray='60 40' stroke-linecap='round' opacity='.65'/%3E%3Ctext x='600' y='310' text-anchor='middle' fill='%23f9fafb' font-family='Inter,Arial,sans-serif' font-size='72' font-weight='700'%3EEcash Flow%3C/text%3E%3Ctext x='600' y='380' text-anchor='middle' fill='%23d1d5db' font-family='Inter,Arial,sans-serif' font-size='32' font-weight='500'%3EDeposit %26%231859; Mint %26%231859; Spend%3C/text%3E%3C/svg%3E"
              src="https://m.primal.net/HsMt.mp4"
              aria-label="Short walkthrough showing how Fundstr turns Bitcoin deposits into private ecash you can spend socially"
            ></video>
            <figcaption class="how-video__caption">
              Watch a quick walkthrough of Fundstr converting a Bitcoin deposit
              into private ecash ready for social payments.
            </figcaption>
          </figure>
          <div class="cards cards--3 rail">
            <div class="card step">
              <span class="emj xl">₿</span>
              <h3>Your Bitcoin</h3>
              <p>From any wallet</p>
            </div>
            <div class="card step">
              <span class="emj xl">🏦</span>
              <h3>The Mint</h3>
              <p>Issues ecash tokens</p>
            </div>
            <div class="card step">
              <span class="emj xl">👛</span>
              <h3>Fundstr Wallet</h3>
              <p>Spend privately</p>
            </div>
          </div>
        </div>
      </section>

      <!-- For whom -->
      <section class="section fade" id="who-for">
        <h2 class="h2 grad center">Built for the Sovereign Individual</h2>
        <div class="cards cards--2">
          <div class="card tcenter">
            <span class="pill">Creators</span><span class="emj xl">🎨</span>
            <h3>Content Creators</h3>
            <p>
              Monetize your audience directly, free from de-platforming and high
              fees.
            </p>
          </div>
          <div class="card tcenter">
            <span class="pill">Privacy</span><span class="emj xl">🛡️</span>
            <h3>Privacy Advocates</h3>
            <p>
              Transact with confidence that your financial life isn't being
              tracked.
            </p>
          </div>
          <div class="card tcenter">
            <span class="pill">Nostr Users</span><span class="emj xl">🔗</span>
            <h3>Nostr Users</h3>
            <p>
              Upgrade your zaps to be truly private and integrate payments
              seamlessly.
            </p>
          </div>
          <div class="card tcenter">
            <span class="pill">Global Citizens</span
            ><span class="emj xl">🌍</span>
            <h3>Global Citizens</h3>
            <p>
              Move value across borders instantly, without relying on
              traditional banking.
            </p>
          </div>
        </div>
      </section>

      <!-- Trust -->
      <section class="section fade" id="trust">
        <h2 class="h2 grad center">Trust Through Transparency</h2>
        <div class="cards cards--4 trust-grid">
          <details class="card">
            <summary class="card-summary">
              <span class="emj xl">💻</span>
              <span class="summary-text">
                <span class="summary-title">Open Source Coming Soon</span>
                <span class="summary-desc"
                  >Fundstr is private for now while we finish cleanup,
                  hardening, and release prep.</span
                >
              </span>
            </summary>
            <div class="detail">
              <p>
                We plan to publish the source soon. For now, we are tightening
                flows, polishing the UX, and documenting the project before that
                release.
              </p>
              <ul class="bullet">
                <li>
                  <a
                    class="ext"
                    href="https://delvingbitcoin.org/t/building-intuition-for-the-cashu-blind-signature-scheme/506"
                    target="_blank"
                    rel="noopener"
                    >Cashu blind signature scheme</a
                  >
                </li>
                <li>
                  <a
                    class="ext"
                    href="https://docs.cashu.space/"
                    target="_blank"
                    rel="noopener"
                    >Cashu docs</a
                  >
                </li>
              </ul>
            </div>
          </details>

          <details class="card">
            <summary class="card-summary">
              <span class="emj xl">🔑</span>
              <span class="summary-text">
                <span class="summary-title">You Hold the Keys</span>
                <span class="summary-desc"
                  >You control your ecash tokens and Nostr identity.</span
                >
              </span>
            </summary>
            <div class="detail">
              <p>Only you can authorise payments or posts.</p>
              <ul class="bullet">
                <li>
                  <a
                    class="ext"
                    href="https://www.coindesk.com/learn/what-is-crypto-custody"
                    target="_blank"
                    rel="noopener"
                    >What is crypto custody?</a
                  >
                </li>
                <li>
                  <a
                    class="ext"
                    href="https://nostr.com/"
                    target="_blank"
                    rel="noopener"
                    >What is Nostr?</a
                  >
                </li>
              </ul>
            </div>
          </details>

          <details class="card">
            <summary class="card-summary">
              <span class="emj xl">🛡️</span>
              <span class="summary-text">
                <span class="summary-title">Unbreakable Privacy</span>
                <span class="summary-desc"
                  >Chaumian blind signatures de-link deposits from
                  withdrawals.</span
                >
              </span>
            </summary>
            <div class="detail">
              <ul class="bullet">
                <li>
                  <a
                    class="ext"
                    href="https://bitcoin.design/guide/how-it-works/ecash/cashu/"
                    target="_blank"
                    rel="noopener"
                    >Bitcoin Design Guide: Cashu</a
                  >
                </li>
                <li>
                  <a
                    class="ext"
                    href="https://blog.cashu.space/buckets-of-blind-signatures/"
                    target="_blank"
                    rel="noopener"
                    >Buckets of blind signatures</a
                  >
                </li>
              </ul>
            </div>
          </details>

          <details class="card">
            <summary class="card-summary">
              <span class="emj xl">👛</span>
              <span class="summary-text">
                <span class="summary-title">Mint Diversification</span>
                <span class="summary-desc"
                  >Use multiple mints and watch for odd behaviour.</span
                >
              </span>
            </summary>
            <div class="detail">
              <ul class="bullet">
                <li>
                  <a
                    class="ext"
                    href="https://docs.cashu.space/mints"
                    target="_blank"
                    rel="noopener"
                    >Cashu docs: mints</a
                  >
                </li>
                <li>
                  <a
                    class="ext"
                    href="https://docs.cashu.space/wallets"
                    target="_blank"
                    rel="noopener"
                    >Cashu docs: wallets</a
                  >
                </li>
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

        <div v-if="filteredFaqs.length" class="cards cards--3 faq-grid">
          <details v-for="(f, i) in filteredFaqs" :key="i" class="card">
            <summary class="faq-q">{{ f.q }}</summary>
            <div class="faq-a" v-html="f.a"></div>
          </details>
        </div>
        <div v-else class="card center" aria-live="polite">
          <p class="lead">No questions found. Try a different search.</p>
        </div>
      </section>

      <!-- Community + CTA -->
      <section class="section fade" id="community">
        <h2 class="h2 grad center">Join the Conversation</h2>
        <p class="center">
          Follow the project and its creator on Nostr to connect with the
          community.
        </p>

        <div class="cards cards--3 community-grid">
          <a
            href="https://primal.net/p/nprofile1qqsdndspt5x07jhp5vrs0s4a7z0spwl4v28su0263vdjmwfmumxdygc6lzn8y"
            target="_blank"
            rel="noopener"
            class="card tcenter community-card"
          >
            <span class="emj xl">🧡</span>
            <h3>Fundstr on Nostr</h3>
            <p>Project profile ↗️</p>
          </a>
          <a
            href="https://primal.net/KalonAxiarch"
            target="_blank"
            rel="noopener"
            class="card tcenter community-card"
          >
            <span class="emj xl">👤</span>
            <h3>Creator’s Profile</h3>
            <p>Primal profile ↗️</p>
          </a>
          <router-link
            :to="{
              name: 'PublicCreatorProfile',
              params: {
                npubOrHex:
                  'npub1aljmhjp5tqrw3m60ra7t3u8uqq223d6rdg9q0h76a8djd9m4hmvsmlj82m',
              },
              query: { tab: 'tiers' },
            }"
            class="card tcenter community-card"
          >
            <span class="emj xl">💵</span>
            <h3>KalonAxiarch’s Tiers</h3>
            <p>Browse creator tiers</p>
          </router-link>
          <router-link
            :to="{
              name: 'PublicCreatorProfile',
              params: {
                npubOrHex:
                  'npub1mxmqzhgvla9wrgc8qlptmuylqzal2c50pc744zcm9kunhekv6g3s63ytu0',
              },
              query: { tab: 'tiers' },
            }"
            class="card tcenter community-card"
          >
            <span class="emj xl">🧡</span>
            <h3>Official Fundstr Tiers</h3>
            <p>Open supporter tiers</p>
          </router-link>
        </div>
      </section>

      <section class="section fade cta">
        <h2 class="h2 grad center">Ready to Join the Movement?</h2>
        <p class="center">
          Explore Fundstr now, support development, and watch for the public
          source release coming soon.
        </p>
        <div class="cta-row">
          <router-link class="btn solid" to="/wallet"
            >Launch Wallet</router-link
          >
          <router-link class="btn outline" to="/find-creators"
            >Find Creators</router-link
          >
          <router-link class="btn outline" to="/creator-studio"
            >Creator Studio</router-link
          >
        </div>
      </section>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watchEffect } from "vue";
import { useQuasar } from "quasar";

const $q = useQuasar();
const isDark = ref($q.dark.isActive);
watchEffect(() => (isDark.value = $q.dark.isActive));

const root = ref<HTMLElement | null>(null);
let fadeObserver: IntersectionObserver | null = null;
let sectionObserver: IntersectionObserver | null = null;
let navLinks: HTMLAnchorElement[] = [];
let observedSections: HTMLElement[] = [];
const sectionVisibility = new Map<Element, number>();
let currentActiveSection: string | null = null;

function updateActiveLink(nextId: string | null) {
  if (currentActiveSection === nextId) return;

  currentActiveSection = nextId;
  navLinks.forEach((link) => {
    const isActive = nextId ? link.hash === `#${nextId}` : false;
    link.classList.toggle("active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "true");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

onMounted(() => {
  const pageRoot = root.value;
  if (!pageRoot) return;

  fadeObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          fadeObserver?.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 },
  );

  pageRoot
    .querySelectorAll<HTMLElement>(".fade")
    .forEach((el) => fadeObserver?.observe(el));

  navLinks = Array.from(
    pageRoot.querySelectorAll<HTMLAnchorElement>(".section-nav__link"),
  );
  observedSections = navLinks
    .map((link) =>
      link.hash ? pageRoot.querySelector<HTMLElement>(link.hash) : null,
    )
    .filter((section): section is HTMLElement => Boolean(section));

  if (!observedSections.length) return;

  sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          sectionVisibility.set(entry.target, entry.intersectionRatio);
        } else {
          sectionVisibility.delete(entry.target);
        }
      });

      if (sectionVisibility.size > 0) {
        const [topSection] = Array.from(sectionVisibility.entries()).sort(
          (a, b) => b[1] - a[1],
        );
        if (topSection) {
          const element = topSection[0] as HTMLElement;
          updateActiveLink(element.id);
        }
        return;
      }

      const firstSectionTop =
        observedSections[0]?.getBoundingClientRect().top ?? 0;
      if (firstSectionTop > 0) {
        updateActiveLink(null);
      }
    },
    { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.1, 0.25, 0.5, 0.75] },
  );

  observedSections.forEach((section) => sectionObserver?.observe(section));
});
onBeforeUnmount(() => {
  fadeObserver?.disconnect();
  sectionObserver?.disconnect();
  sectionVisibility.clear();
  navLinks = [];
  observedSections = [];
  currentActiveSection = null;
});

const faqQuery = ref("");
const siteOverviewCards = [
  {
    emoji: "💰",
    title: "Money",
    to: "/wallet",
    links: [
      { emoji: "💳", label: "Wallet", to: "/wallet" },
      { emoji: "📦", label: "Buckets", to: "/buckets" },
      { emoji: "📄", label: "Subscriptions", to: "/subscriptions" },
    ],
  },
  {
    emoji: "⭐",
    title: "Creators",
    to: "/find-creators",
    links: [
      { emoji: "🔍", label: "Find Creators", to: "/find-creators" },
      { emoji: "👩‍🎨", label: "Creator Studio", to: "/creator-studio" },
    ],
  },
  {
    emoji: "💬",
    title: "Comms",
    to: "/nostr-messenger",
    links: [
      { emoji: "💬", label: "Nostr Messenger", to: "/nostr-messenger" },
      { emoji: "🔑", label: "Nostr Login", to: "/nostr-login" },
    ],
  },
  {
    emoji: "⚙️",
    title: "System",
    to: "/settings",
    links: [
      { emoji: "⚙️", label: "Settings", to: "/settings" },
      { emoji: "🔄", label: "Restore", to: "/restore" },
      { emoji: "⚠️", label: "Already Running", to: "/already-running" },
      { emoji: "ℹ️", label: "Welcome", to: "/welcome" },
      { emoji: "⚖️", label: "Terms", to: "/terms" },
    ],
  },
];
const faqs = ref([
  {
    q: "What if a fan stops paying?",
    a: "Creator view » Their timelocked token never unlocks for you. Fundstr flags the user as “Expired” and hides future paid posts. Fan view » You simply don’t renew. No recurring pull, no surprise charges.",
  },
  {
    q: "Can I withdraw to a Lightning wallet?",
    a: "Yes. Wallet → Send → Lightning Invoice. Paste the invoice from any external wallet; Fundstr melts tokens at the mint and pays it.",
  },
  {
    q: "How private is this really?",
    a: `<ul class="bullet"><li>Mints see withdraw/redeem events but cannot correlate them.</li><li>Nostr chats are E2E encrypted; Nutzaps use P2PK so only the intended receiver can claim them.</li><li>Use different mints/buckets to compartmentalise further.</li></ul>`,
  },
  {
    q: "What exactly is Cashu?",
    a: "Chaumian e-cash. The mint issues anonymised tokens; transactions never touch the blockchain and the mint cannot link where your tokens are spent.",
  },
  {
    q: "Do I need to trust a mint?",
    a: "A mint is required to issue/redeem tokens. Reduce risk by holding small balances, spreading across mints, and withdrawing if a mint looks risky.",
  },
  {
    q: "How can I back up or restore?",
    a: "Generate a BIP-39 seed during setup. Keep it safe. Reinstall the app, enter the seed, reconnect to your mints to restore unspent tokens.",
  },
  {
    q: "What are “Buckets”?",
    a: "Sub-accounts for budgeting (e.g., savings, subscriptions). Move funds instantly and keep project funds separate.",
  },
  {
    q: "How does the Nostr integration work?",
    a: "Generate/import a Nostr keypair, connect to relays, and send encrypted DMs—enabling token transfers and tipping through Nostr events.",
  },
  {
    q: "What are Nutzaps?",
    a: "Cashu tokens sent via Nostr “zap” events. Publish your NIP-61 profile and others can tip ecash locked to your Nostr wallet key.",
  },
  {
    q: "Are there any fees?",
    a: "Peer-to-peer token sends are free. Fees may apply when minting/melting via Lightning, depending on the mint and network conditions.",
  },
  {
    q: "Does the app work offline?",
    a: "Balances/buckets/messages are visible offline. Creating/redeeming tokens, chatting, and Nutzaps require mint/relay connectivity.",
  },
  {
    q: "When is the public source release?",
    a: "Fundstr is still private while we finish cleanup, hardening, and documentation. The public source release is coming soon.",
  },
]);
const filteredFaqs = computed(() => {
  const q = faqQuery.value.trim().toLowerCase();
  return q
    ? faqs.value.filter((f) => f.q.toLowerCase().includes(q))
    : faqs.value;
});
</script>

<style scoped>
/* Theme tokens (scoped) */
.theme {
  --s1: #0a0d15;
  --s2: #141824;
  --txt: #e0e7ff;
  --ac500: #8b5cf6;
  --acRGB: 168, 85, 247;
  color: var(--txt);
}
.theme:not(.dark) {
  --s1: #fff;
  --s2: #f3f4f6;
  --txt: #0f172a;
  --ac500: #7c3aed;
  --acRGB: 139, 92, 246;
  color: var(--txt);
}

/* Layout */
.container {
  max-width: 1080px;
  margin: 0 auto;
  padding: 0 1.25rem;
}
.section {
  padding: 4rem 0;
}
.center {
  text-align: center;
}
.tcenter {
  text-align: center;
}

.h1 {
  font-weight: 800;
  font-size: clamp(2.25rem, 3vw+1rem, 3.5rem);
  margin: 0 0 1rem;
}
.h2 {
  font-weight: 800;
  font-size: clamp(1.75rem, 2vw+1rem, 2.75rem);
  margin: 0 0 1.25rem;
}
.lead {
  font-size: 1.1rem;
  line-height: 1.65;
}
.grad {
  background: linear-gradient(90deg, #a855f7, #4f46e5, #0ea5e9);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.section-nav {
  position: sticky;
  top: 0;
  z-index: 15;
  margin: 0 -1.25rem 3rem;
  padding: 0.5rem 1.25rem;
  background: var(--s1);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(var(--acRGB), 0.16);
}
.section-nav__list {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  padding: 0.25rem 0;
  margin: 0;
  list-style: none;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scroll-snap-type: x proximity;
}
.section-nav__list::-webkit-scrollbar {
  height: 6px;
}
.section-nav__list::-webkit-scrollbar-thumb {
  background: rgba(var(--acRGB), 0.35);
  border-radius: 999px;
}
.section-nav__list::-webkit-scrollbar-track {
  background: transparent;
}
.section-nav__link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.35rem 0.95rem;
  margin: 0;
  text-decoration: none;
  font-weight: 600;
  transition: background-color 0.2s, border-color 0.2s, box-shadow 0.2s,
    color 0.2s;
  flex: 0 0 auto;
  white-space: nowrap;
  scroll-snap-align: center;
}
.section-nav__link:hover {
  background: rgba(var(--acRGB), 0.22);
  border-color: rgba(var(--acRGB), 0.55);
}
.section-nav__link:active {
  background: rgba(var(--acRGB), 0.3);
}
.section-nav__link.active {
  background: rgba(var(--acRGB), 0.28);
  border-color: rgba(var(--acRGB), 0.65);
  color: var(--ac500);
  box-shadow: 0 6px 18px rgba(var(--acRGB), 0.2);
}
.section-nav__link.active:hover {
  background: rgba(var(--acRGB), 0.32);
}
.section-nav__link:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--s1), 0 0 0 5px rgba(var(--acRGB), 0.55);
}
.section-nav__link.active:focus-visible {
  box-shadow: 0 0 0 2px var(--s1), 0 0 0 6px rgba(var(--acRGB), 0.65);
}

.hero-grid {
  display: grid;
  gap: 2rem;
  align-items: start;
}
@media (min-width: 1024px) {
  .hero-grid {
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
  }
}

.hero-copy {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.hero-warning {
  margin-top: 1.25rem;
  color: var(--txt);
}
.hero-warning p {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.55;
}
.hero-warning__title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 700;
  font-size: 0.85rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ac500);
}
.hero-warning__label {
  display: inline-flex;
  align-items: center;
}

.hero-aside {
  display: flex;
  align-items: stretch;
}
.hero-aside__card {
  background: var(--s2);
  border: 1px solid rgba(var(--acRGB), 0.2);
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.22);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.hero-aside__title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
}
.hero-stats {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.hero-stats__metric {
  display: block;
  font-weight: 700;
  font-size: 1rem;
  color: var(--ac500);
}
.hero-stats__meta {
  display: block;
  font-size: 0.95rem;
  line-height: 1.5;
  color: var(--txt);
  opacity: 0.75;
}
@media (max-width: 640px) {
  .hero-warning {
    margin-top: 1rem;
  }
  .hero-aside__card {
    padding: 1.25rem;
  }
}

.alpha {
  background: var(--s2);
  border: 1px solid rgba(var(--acRGB), 0.35);
  border-radius: 1rem;
  padding: 1rem 1.25rem;
  box-shadow: 0 0 16px rgba(var(--acRGB), 0.15);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.alpha-icon {
  font-size: 1.75rem;
  margin-right: 0;
}

/* Grid helpers */
.cards {
  display: grid;
  gap: 1rem;
}
.cards--2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.cards--3 {
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
}
.cards--4 {
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
}
@media (max-width: 1080px) {
  .site-overview-grid,
  .trust-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .faq-grid,
  .community-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 640px) {
  .cards--2,
  .cards--3,
  .cards--4 {
    grid-template-columns: 1fr;
  }
}

.rail.cards--3 {
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.how-layout {
  display: grid;
  gap: 1.5rem;
  align-items: start;
}
@media (min-width: 1024px) {
  .how-layout {
    grid-template-columns: 1.1fr 0.9fr;
  }
}

.how-video {
  margin: 0;
  background: var(--s2);
  border: 1px solid rgba(var(--acRGB), 0.2);
  border-radius: 1rem;
  padding: 1rem;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.22);
}
.how-video__player {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 0.75rem;
  background: #000;
}
.how-video__caption {
  margin-top: 0.75rem;
  font-size: 0.95rem;
  line-height: 1.5;
  color: var(--txt);
}

.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
}
@media (max-width: 960px) {
  .two-col {
    grid-template-columns: 1fr;
  }
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}
@media (max-width: 600px) {
  .feature-grid {
    grid-template-columns: 1fr;
  }
}

.feature {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.5rem;
}
.feature-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--ac500), #4f46e5);
  color: #fff;
}

/* Cards */
.card {
  background: var(--s2);
  border: 1px solid rgba(var(--acRGB), 0.18);
  border-radius: 1rem;
  padding: 1.4rem;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.25);
  transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
  display: block;
  color: inherit;
  text-decoration: none;
}
.card--overview {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.card--overview:hover {
  transform: translateY(-6px);
  box-shadow: 0 12px 22px rgba(0, 0, 0, 0.3);
  border-color: rgba(var(--acRGB), 0.35);
}
.card--overview:focus-within {
  transform: translateY(-6px);
  border-color: rgba(var(--acRGB), 0.35);
  box-shadow: 0 0 0 3px var(--s1), 0 0 0 6px rgba(var(--acRGB), 0.55),
    0 12px 22px rgba(0, 0, 0, 0.3);
}
.card-link__primary {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  color: inherit;
  text-decoration: none;
  font-weight: 700;
  transition: color 0.2s ease;
}
.card-link__primary:hover {
  color: var(--ac500);
}
.card-link__primary:focus-visible {
  outline: none;
  color: var(--ac500);
}
.card-link__primary h3 {
  margin: 0;
  min-width: 0;
  line-height: 1.2;
}
.card-summary {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  min-width: 0;
  cursor: pointer;
  list-style: none;
}
.card-summary::-webkit-details-marker,
.faq-q::-webkit-details-marker {
  display: none;
}
.summary-text {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
  white-space: normal; /* ensure wrapping */
}
.summary-title {
  display: block;
  line-height: 1.25;
}
.summary-desc {
  display: block;
  line-height: 1.5;
}
.links {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.5rem;
}
.links li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  min-width: 0;
}
.link-text {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  color: inherit;
  text-decoration: none;
  border-radius: 0.45rem;
  padding: 0.05rem 0.35rem;
  transition: color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;
}
.link-text:hover {
  color: var(--ac500);
  background: rgba(var(--acRGB), 0.14);
}
.link-text:focus-visible {
  outline: none;
  color: var(--ac500);
  background: rgba(var(--acRGB), 0.18);
  box-shadow: 0 0 0 2px var(--s1), 0 0 0 5px rgba(var(--acRGB), 0.55);
}
.emj {
  font-size: 1.25rem;
}
.emj.xl {
  font-size: 2rem;
}
.pill {
  display: inline-block;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  font-weight: 700;
  letter-spacing: 0.02em;
  background: rgba(var(--acRGB), 0.15);
  color: var(--ac500);
  border: 1px solid var(--ac500);
  margin-bottom: 0.5rem;
}

.card h3,
.card p,
.link-text,
.faq-q,
.summary-title,
.summary-desc {
  overflow-wrap: anywhere;
  word-break: break-word;
}

.card p,
.detail p,
.faq-a,
.community-card p {
  line-height: 1.55;
}

.faq-grid .card,
.community-card,
.trust-grid .card,
.site-overview-grid .card {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  min-width: 0;
}

.faq-q {
  display: block;
  cursor: pointer;
  list-style: none;
  line-height: 1.35;
}

.faq-a {
  min-width: 0;
}

.community-card {
  align-items: center;
  justify-content: flex-start;
  text-align: center;
}

.community-card h3 {
  margin: 0;
  line-height: 1.2;
  max-width: 100%;
  font-size: clamp(1.45rem, 2.2vw, 2.35rem);
  text-wrap: balance;
}

.community-card p {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  text-wrap: balance;
}

.trust-grid .detail,
.faq-grid .card,
.site-overview-grid .card {
  min-width: 0;
}

@media (max-width: 768px) {
  .card {
    padding: 1.2rem;
  }

  .summary-text {
    gap: 0.25rem;
  }
}

@media (min-width: 768px) {
  .section-nav {
    margin: 0 0 3rem;
    top: 1rem;
    padding: 0.75rem 1rem;
    border: 1px solid rgba(var(--acRGB), 0.22);
    border-radius: 999px;
    background: var(--s2);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
    border-bottom: none;
  }
  .section-nav__list {
    justify-content: center;
    overflow: visible;
  }
}

/* Rail connectors for steps */
.rail .step {
  position: relative;
}
@media (min-width: 768px) {
  .rail .step:not(:last-child)::after {
    content: "";
    position: absolute;
    top: 50%;
    right: -20px;
    width: 40px;
    height: 2px;
    background: currentColor;
    opacity: 0.25;
    transform: translateY(-50%);
  }
}
@media (max-width: 767px) {
  .rail .step:not(:last-child)::after {
    content: "";
    position: absolute;
    left: 50%;
    bottom: -20px;
    width: 2px;
    height: 40px;
    background: currentColor;
    opacity: 0.25;
    transform: translateX(-50%);
  }
}

/* FAQ */
.faq-search {
  max-width: 520px;
  margin: 0 auto 1rem;
}
.input {
  width: 100%;
  padding: 0.75rem 0.9rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(var(--acRGB), 0.28);
  background: var(--s2);
  color: var(--txt);
}
.input:focus {
  outline: none;
  box-shadow: 0 0 0 3px rgba(var(--acRGB), 0.35);
}

.faq-q {
  font-weight: 700;
  font-size: 1.05rem;
}
.faq-a {
  margin-top: 0.75rem;
  font-size: 0.92rem;
}
.bullet {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0;
  margin: 0;
}
.bullet li {
  position: relative;
  padding-left: 1.25rem;
}
.bullet li::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0.6em;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--ac500);
  transform: translateY(-50%);
}
@media (max-width: 600px) {
  .bullet {
    align-items: center;
  }
}

/* CTA */
.cta {
  background: linear-gradient(
    90deg,
    rgba(var(--acRGB), 0.1),
    rgba(var(--acRGB), 0.05)
  );
  border-radius: 1rem;
}
.cta-row {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 1rem;
}
.hero-cta {
  justify-content: flex-start;
}
.btn {
  font-weight: 700;
  padding: 0.9rem 1.25rem;
  border-radius: 0.6rem;
  border: 2px solid var(--ac500);
  text-decoration: none;
}
.btn.solid {
  background: var(--ac500);
  color: #fff;
}
.btn.outline {
  color: var(--ac500);
}
.btn.outline:hover {
  background: var(--ac500);
  color: #fff;
}

/* Fade in on enter */
.fade {
  opacity: 0;
  transform: translateY(18px);
  transition: opacity 0.6s ease, transform 0.6s ease;
}
.fade.visible {
  opacity: 1;
  transform: none;
}
</style>
