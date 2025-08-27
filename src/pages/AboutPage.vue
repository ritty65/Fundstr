<template>
  <div class="about-page antialiased">
    <div class="max-w-screen-xl mx-auto px-4 md:grid md:grid-cols-12 gap-8">
      <aside
        class="hidden md:block md:col-span-3"
        aria-label="About page table of contents"
      >
        <nav class="sticky top-24 space-y-2 text-sm" id="about-toc">
          <a
            v-for="item in tocItems"
            :key="item.id"
            :href="`#${item.id}`"
            class="toc-link block"
            :data-target="item.id"
          >
            {{ item.label }}
          </a>
        </nav>
      </aside>

      <div class="md:col-span-9">
        <!-- Hero + Alpha warning -->
        <section class="pt-32 md:pt-40 pb-12 md:pb-20 fade-in-section">
          <div class="grid md:grid-cols-12 gap-6 items-start">
            <div class="md:col-span-7 text-center md:text-left">
              <h1 class="text-5xl md:text-7xl font-extrabold mb-6">
                About <span class="gradient-text">Fundstr</span>
              </h1>
              <p class="text-lg md:text-xl max-w-prose">
                A privacy-first Bitcoin wallet, social chat, and creator-monetisation
                hub built on the open-source Cashu ecash protocol and the decentralised
                Nostr network.
              </p>
            </div>
            <div class="md:col-span-5">
              <div class="alpha-warning flex items-start gap-3" role="alert">
                <q-icon name="warning" size="32px" class="text-accent" aria-hidden="true" />
                <p>
                  Fundstr is experimental alpha software. Features may break or change,
                  and loss of funds is possible. Use only small amounts you can afford
                  to lose.
                </p>
              </div>
            </div>
          </div>
        </section>

        <!-- Vision -->
        <section id="vision" class="py-12 md:py-20 fade-in-section">
          <div class="grid md:grid-cols-12 gap-6 items-start">
            <div class="md:col-span-7">
              <h2 class="text-3xl md:text-5xl font-bold mb-6 gradient-text">
                Your Money, Your Network
              </h2>
              <p class="text-lg md:text-xl max-w-prose">
                We believe in a world where your financial life and social
                interactions are truly your own. Fundstr is an experiment in creating
                a parallel, peer-to-peer economy—free from corporate gatekeepers,
                surveillance, and unpredictable fees. It’s a gateway to a more
                sovereign way of connecting and transacting.
              </p>
            </div>
            <ul class="md:col-span-5 list-disc pl-5 space-y-2 text-left">
              <li>Private payments</li>
              <li>Open protocols</li>
              <li>No corporate gatekeepers</li>
              <li>No surveillance</li>
              <li>Predictable fees</li>
            </ul>
          </div>
        </section>

        <!-- Site Overview -->
        <section id="site-overview" class="py-12 md:py-20 fade-in-section">
          <h2 class="text-3xl md:text-5xl font-bold mb-6 text-center gradient-text">
            {{ $t("AboutPage.siteOverview.title") }}
          </h2>

          <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 text-left items-stretch">
            <article
              v-for="cluster in overviewClusters"
              :key="cluster.title"
              class="interactive-card p-5 h-full flex flex-col"
            >
              <header class="flex items-center gap-3 mb-3">
                <q-icon
                  v-if="cluster.icon"
                  :name="cluster.icon"
                  size="24px"
                  class="text-accent"
                  aria-hidden="true"
                />
                <h3 class="font-semibold">{{ cluster.title }}</h3>
              </header>

              <ul class="space-y-2 text-sm">
                <li v-for="link in cluster.items" :key="link.to">
                  <router-link
                    :to="link.to"
                    class="flex items-center gap-2 hover:underline"
                    :aria-label="$t(link.titleKey)"
                  >
                    <component
                      v-if="link.iconComponent"
                      :is="link.iconComponent"
                      class="w-4 h-4 text-accent"
                      aria-hidden="true"
                    />
                    <q-icon
                      v-else
                      :name="link.icon"
                      size="18px"
                      class="text-accent"
                      aria-hidden="true"
                    />
                    <span>{{ tOr(link.titleKey) }}</span>
                  </router-link>
                </li>
              </ul>
            </article>
          </div>
        </section>

        <!-- How Ecash Works -->
        <section id="how-it-works" class="py-12 md:py-20 fade-in-section">
          <h2 class="text-3xl md:text-5xl font-bold mb-6 text-center gradient-text">
            How Ecash Works
          </h2>
          <p class="text-lg md:text-xl mb-12 max-w-prose mx-auto text-center">
            The loop is simple: Bitcoin in → private e-cash out → social payments
            everywhere.
          </p>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-8 justify-items-center">
            <div class="how-step interactive-card p-6 flex flex-col items-center text-center h-full max-w-xs">
              <q-icon
                name="currency_bitcoin"
                size="32px"
                class="mb-4 text-accent"
                aria-hidden="true"
              />
              <h3 class="font-semibold text-lg mb-1">Your Bitcoin</h3>
              <p class="text-sm">From any wallet</p>
            </div>
            <div class="how-step interactive-card p-6 flex flex-col items-center text-center h-full max-w-xs">
              <q-icon
                name="account_balance"
                size="32px"
                class="mb-4 text-accent"
                aria-hidden="true"
              />
              <h3 class="font-semibold text-lg mb-1">The Mint</h3>
              <p class="text-sm">Issues ecash tokens</p>
            </div>
            <div class="how-step interactive-card p-6 flex flex-col items-center text-center h-full max-w-xs">
              <q-icon
                name="account_balance_wallet"
                size="32px"
                class="mb-4 text-accent"
                aria-hidden="true"
              />
              <h3 class="font-semibold text-lg mb-1">Fundstr Wallet</h3>
              <p class="text-sm">Spend privately</p>
            </div>
          </div>
        </section>

    <!-- Built for the Sovereign Individual -->
    <section id="who-for" class="py-12 md:py-20 fade-in-section">
      <h2 class="text-3xl md:text-5xl font-bold mb-12 text-center gradient-text">
        Built for the Sovereign Individual
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <!-- Card 1 -->
        <div class="interactive-card p-6 flex flex-col items-center text-center h-full focus:outline-none focus:ring-2 focus:ring-accent-500">
          <q-badge color="accent" outline class="mb-2">Creators</q-badge>
          <q-icon name="brush" size="32px" class="mb-4 text-accent" aria-hidden="true" />
          <h3 class="font-semibold text-lg mb-2">Content Creators</h3>
          <p class="text-sm">
            Monetize your audience directly, free from de-platforming and high
            fees.
          </p>
        </div>

        <!-- Card 2 -->
        <div class="interactive-card p-6 flex flex-col items-center text-center h-full focus:outline-none focus:ring-2 focus:ring-accent-500">
          <q-badge color="accent" outline class="mb-2">Privacy</q-badge>
          <q-icon name="shield" size="32px" class="mb-4 text-accent" aria-hidden="true" />
          <h3 class="font-semibold text-lg mb-2">Privacy Advocates</h3>
          <p class="text-sm">
            Transact with confidence that your financial life isn't being
            tracked.
          </p>
        </div>

        <!-- Card 3 -->
        <div class="interactive-card p-6 flex flex-col items-center text-center h-full focus:outline-none focus:ring-2 focus:ring-accent-500">
          <q-badge color="accent" outline class="mb-2">Nostr Users</q-badge>
          <q-icon name="link" size="32px" class="mb-4 text-accent" aria-hidden="true" />
          <h3 class="font-semibold text-lg mb-2">Nostr Users</h3>
          <p class="text-sm">
            Upgrade your zaps to be truly private and integrate payments
            seamlessly.
          </p>
        </div>

        <!-- Card 4 -->
        <div class="interactive-card p-6 flex flex-col items-center text-center h-full focus:outline-none focus:ring-2 focus:ring-accent-500">
          <q-badge color="accent" outline class="mb-2">Global Citizens</q-badge>
          <q-icon name="public" size="32px" class="mb-4 text-accent" aria-hidden="true" />
          <h3 class="font-semibold text-lg mb-2">Global Citizens</h3>
          <p class="text-sm">
            Move value across borders instantly, without relying on
            traditional banking.
          </p>
        </div>
      </div>
    </section>

        <!-- Navigation Map -->
        <section id="navigation-map" class="py-12 md:py-20 fade-in-section">
          <BaseContainer class="text-center">
            <h2 class="text-3xl md:text-5xl font-bold mb-6 gradient-text">
              Navigation Map
            </h2>
            <p class="text-lg md:text-xl mb-12 max-w-prose mx-auto">
              Every page explained from both the Creator and Fan perspectives.
            </p>
            <NavigationMap :items="navigationItems" />
          </BaseContainer>
        </section>

        <!-- Trust Through Transparency -->
        <section id="trust" class="py-12 md:py-20 fade-in-section">
          <BaseContainer class="text-center">
            <h2 class="text-3xl md:text-5xl font-bold mb-12 gradient-text">
              Trust Through Transparency
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              <!-- Card 1 -->
              <details class="interactive-card p-6 text-left h-full">
                <summary class="flex items-start gap-3 cursor-pointer">
                  <q-icon name="code" size="32px" class="text-accent" aria-hidden="true" />
                  <div>
                    <span class="block font-semibold text-xl mb-1">Open Source & Verifiable</span>
                    <span class="block text-sm">Fundstr is built on open-source code. We invite you to inspect, verify, and contribute. Transparency is our core principle.</span>
                  </div>
                </summary>
                <div class="mt-4 text-sm space-y-2">
                  <p>
                    Anyone can audit our wallet and mint implementations or even
                    reproduce the exact binaries we ship.
                  </p>
                  <ul class="list-disc pl-6 space-y-1">
                <li>
                  <a
                    href="https://opensource.org/osd?utm_source=chatgpt.com"
                    target="_blank"
                    rel="noopener"
                    >Open Source Definition</a
                  >
                </li>
                <li>
                  <a
                    href="https://github.com/cashubtc?utm_source=chatgpt.com"
                    target="_blank"
                    rel="noopener"
                    >Cashu organisation on GitHub</a
                  >
                </li>
                <li>
                  <a
                    href="https://linderud.dev/blog/nixos-is-not-reproducible/?utm_source=chatgpt.com"
                    target="_blank"
                    rel="noopener"
                    >Build provenance and reproducible builds</a
                  >
                </li>
                <li>
                  <a
                    href="https://telegram.org/blog/verifiable-apps-and-more?utm_source=chatgpt.com"
                    target="_blank"
                    rel="noopener"
                    >Telegram's verifiable builds programme</a
                  >
                </li>
              </ul>
            </div>
          </details>

          <!-- Card 2 -->
          <details class="interactive-card p-6 text-left h-full">
            <summary class="flex items-start gap-3 cursor-pointer">
              <q-icon name="vpn_key" size="32px" class="text-accent" aria-hidden="true" />
              <div>
                <span class="block font-semibold text-xl mb-1">You Hold the Keys</span>
                <span class="block text-sm">You are the sole holder of your ecash tokens and Nostr identity. Mints act as custodians for the underlying Bitcoin, but only you can spend your ecash.</span>
              </div>
            </summary>
            <div class="mt-4 text-sm space-y-2">
              <p>
                Owning your private key means only you can authorise payments or
                posts.
              </p>
              <ul class="list-disc pl-6 space-y-1">
                <li>
                  <a
                    href="https://www.coindesk.com/learn/what-is-crypto-custody?utm_source=chatgpt.com"
                    target="_blank"
                    rel="noopener"
                    >CoinDesk: What is crypto custody?</a
                  >
                </li>
                <li>
                  <a
                    href="https://www.investopedia.com/terms/p/private-key.asp?utm_source=chatgpt.com"
                    target="_blank"
                    rel="noopener"
                    >Investopedia: Private keys explained</a
                  >
                </li>
                <li>
                  <a
                    href="https://github.com/nostr-protocol/nips?utm_source=chatgpt.com"
                    target="_blank"
                    rel="noopener"
                    >Nostr Implementation Possibilities (NIPs)</a
                  >
                </li>
              </ul>
            </div>
          </details>

          <!-- Card 3 -->
          <details class="interactive-card p-6 text-left h-full">
            <summary class="flex items-start gap-3 cursor-pointer">
              <q-icon name="shield" size="32px" class="text-accent" aria-hidden="true" />
              <div>
                <span class="block font-semibold text-xl mb-1">Unbreakable Privacy</span>
                <span class="block text-sm">Thanks to Chaumian blind signatures, mints cannot link your deposits to your withdrawals. Your spending habits remain completely private.</span>
              </div>
            </summary>
            <div class="mt-4 text-sm space-y-2">
              <p>
                Blind signatures break the trail between your deposits and
                spends, even from the mint itself.
              </p>
              <ul class="list-disc pl-6 space-y-1">
                <li>
                  <a
                    href="https://sceweb.sce.uhcl.edu/yang/teaching/csci5234WebSecurityFall2011/Chaum-blind-signatures.PDF?utm_source=chatgpt.com"
                    target="_blank"
                    rel="noopener"
                    >David Chaum's original paper</a
                  >
                </li>
                <li>
                  <a
                    href="https://medium.com/rootstock-tech-blog/blind-signatures-af6338da6347?utm_source=chatgpt.com"
                    target="_blank"
                    rel="noopener"
                    >Rootstock: blind signatures explainer</a
                  >
                </li>
                <li>
                  <a
                    href="https://delvingbitcoin.org/t/building-intuition-for-the-cashu-blind-signature-scheme/506?utm_source=chatgpt.com"
                    target="_blank"
                    rel="noopener"
                    >Building intuition for Cashu's scheme</a
                  >
                </li>
                <li>
                  <a
                    href="https://blog.cashu.space/buckets-of-blind-signatures/?utm_source=chatgpt.com"
                    target="_blank"
                    rel="noopener"
                    >Buckets of blind signatures</a
                  >
                </li>
                <li>
                  <a
                    href="https://bitcoin.design/guide/how-it-works/ecash/cashu/?utm_source=chatgpt.com"
                    target="_blank"
                    rel="noopener"
                    >Bitcoin Design guide: Cashu overview</a
                  >
                </li>
              </ul>
            </div>
          </details>

          <!-- Card 4 -->
          <details class="interactive-card p-6 text-left h-full">
            <summary class="flex items-start gap-3 cursor-pointer">
              <q-icon name="account_balance_wallet" size="32px" class="text-accent" aria-hidden="true" />
              <div>
                <span class="block font-semibold text-xl mb-1">Mint Diversification</span>
                <span class="block text-sm">Fundstr supports multiple mints, allowing you to diversify your holdings. Our audit tools will warn you (⚠️) of any unusual mint behavior.</span>
              </div>
            </summary>
            <div class="mt-4 text-sm space-y-2">
              <p>
                Spreading tokens across independent mints limits custodial risk.
              </p>
              <ul class="list-disc pl-6 space-y-1">
                <li>
                  <a
                    href="https://docs.cashu.space/mints?utm_source=chatgpt.com"
                    target="_blank"
                    rel="noopener"
                    >Cashu docs: mints</a
                  >
                </li>
                <li>
                  <a
                    href="https://bitcoinmagazine.com/technical/the-emerging-bitcoin-modular-ecosystem?utm_source=chatgpt.com"
                    target="_blank"
                    rel="noopener"
                    >Bitcoin Magazine: modular ecosystem</a
                  >
                </li>
                <li>
                  <a
                    href="https://github.com/cashubtc/awesome-cashu?utm_source=chatgpt.com"
                    target="_blank"
                    rel="noopener"
                    >Awesome Cashu resources</a
                  >
                </li>
                <li>
                  <a
                    href="https://www.nasdaq.com/articles/how-to-guide%3A-running-an-ecash-mint?utm_source=chatgpt.com"
                    target="_blank"
                    rel="noopener"
                    >Nasdaq guide: running an ecash mint</a
                  >
                </li>
              </ul>
            </div>
          </details>
        </div>
      </BaseContainer>
    </section>

    <!-- FAQ -->
    <section id="faq" class="py-12 md:py-20 fade-in-section">
      <h2 class="text-3xl md:text-5xl font-bold mb-12 text-center gradient-text">
        Frequently Asked Questions
      </h2>
      <div class="mb-6 flex justify-center">
        <q-input v-model="faqSearch" dense clearable placeholder="Search..." aria-label="Search questions" class="w-full md:w-1/2" />
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <details v-for="faq in filteredFaqs" :key="faq.q" class="interactive-card p-4 w-full">
          <summary class="cursor-pointer font-semibold text-lg">{{ faq.q }}</summary>
          <div v-if="Array.isArray(faq.a)" class="mt-4 text-sm">
            <ul class="list-disc pl-6 space-y-1">
              <li v-for="line in faq.a" :key="line">{{ line }}</li>
            </ul>
          </div>
          <p v-else class="mt-4 text-sm">{{ faq.a }}</p>
        </details>
      </div>
    </section>

    <!-- Footer -->
    <footer class="px-4">
      <!-- Community -->
      <section class="py-16 fade-in-section">
        <BaseContainer class="text-center">
          <h2 class="text-3xl md:text-5xl font-bold mb-6 gradient-text">
            Join the Conversation
          </h2>
          <p class="mb-6">
            Follow the project and its creator on Nostr to stay up-to-date and
            connect with the community.
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-accent">
            <a
              href="https://primal.net/KalonAxiarch"
              target="_blank"
              rel="noopener noreferrer"
              class="interactive-card p-6 flex flex-col items-center text-center h-full focus:outline-none focus:ring-2 focus:ring-accent-500"
            >
              <q-icon name="person" size="32px" class="mb-2 text-accent" aria-hidden="true" />
              <span class="font-semibold">Creator's Profile</span>
              <q-icon name="open_in_new" size="20px" class="mt-2 text-accent" aria-hidden="true" />
            </a>
            <a
              href="#"
              target="_blank"
              rel="noopener noreferrer"
              class="interactive-card p-6 flex flex-col items-center text-center h-full focus:outline-none focus:ring-2 focus:ring-accent-500"
            >
              <q-icon name="rocket_launch" size="32px" class="mb-2 text-accent" aria-hidden="true" />
              <span class="font-semibold">Fundstr Project Page</span>
              <q-icon name="open_in_new" size="20px" class="mt-2 text-accent" aria-hidden="true" />
            </a>
            <a
              href="/find-creators?npub=npub1aljmhjp5tqrw3m60ra7t3u8uqq223d6rdg9q0h76a8djd9m4hmvsmlj82m"
              class="interactive-card p-6 flex flex-col items-center text-center h-full focus:outline-none focus:ring-2 focus:ring-accent-500"
            >
              <q-icon name="paid" size="32px" class="mb-2 text-accent" aria-hidden="true" />
              <span class="font-semibold">View KalonAxiarch's Tiers</span>
            </a>
          </div>
        </BaseContainer>
      </section>

      <!-- Quote -->
      <section class="py-16 fade-in-section">
        <div class="max-w-5xl mx-auto">
          <blockquote>
            Fundstr is powered by open-source code and an open community.
            Whether you’re a storyteller earning sats or a fan supporting work
            you love, we hope this guide helps you navigate every page with
            confidence — and makes your next payment feel as effortless as a
            like, comment, or retweet.
          </blockquote>
        </div>
      </section>

      <!-- CTA -->
      <section
        id="cta"
        class="py-16 fade-in-section bg-gradient-to-r from-accent-500/10 to-accent-600/10"
      >
        <div class="max-w-screen-xl mx-auto px-4 text-center">
          <h2 class="text-3xl md:text-5xl font-bold mb-6 gradient-text">
            Ready to Join the Movement?
          </h2>
          <p class="mb-8">
            Install the PWA, explore the code, or help fund development.
          </p>
          <div class="grid md:grid-cols-3 gap-4 justify-items-center">
            <q-btn
              href="#"
              color="accent"
              unelevated
              rounded
              class="px-8 py-3 font-semibold"
              label="Install PWA"
            />
            <q-btn
              href="https://github.com/fundstr/fundstr"
              target="_blank"
              color="accent"
              outline
              rounded
              class="px-8 py-3 font-semibold"
              label="Explore Code"
            />
            <q-btn
              :href="donationLink"
              target="_blank"
              color="accent"
              outline
              rounded
              class="px-8 py-3 font-semibold"
              label="Support Fundstr"
            />
          </div>
        </div>
      </section>
    </footer>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, type Component, ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import NavigationMap from "src/components/NavigationMap.vue";
import BaseContainer from "src/components/BaseContainer.vue";
import FindCreatorsIcon from "src/components/icons/FindCreatorsIcon.vue";
import CreatorHubIcon from "src/components/icons/CreatorHubIcon.vue";
import { useNavigationItems } from "src/composables/navigationItems";

const { t } = useI18n();
const tOr = (key: string, fallback = "") => {
  const val = t(key) as string;
  return val && val !== key ? val : fallback;
};

type ClusterLink = {
  to: string;
  titleKey: string;
  icon?: string;
  iconComponent?: Component;
};
type Cluster = {
  title: string;
  icon?: string;
  items: ClusterLink[];
};

const overviewClusters: Cluster[] = [
  {
    title: "Money",
    icon: "savings",
    items: [
      {
        to: "/wallet",
        titleKey: "MainHeader.menu.wallet.title",
        icon: "account_balance_wallet",
      },
      {
        to: "/buckets",
        titleKey: "MainHeader.menu.buckets.title",
        icon: "inventory_2",
      },
      {
        to: "/subscriptions",
        titleKey: "MainHeader.menu.subscriptions.title",
        icon: "auto_awesome_motion",
      },
    ],
  },
  {
    title: "Creators",
    icon: "star",
    items: [
      {
        to: "/find-creators",
        titleKey: "MainHeader.menu.findCreators.title",
        iconComponent: FindCreatorsIcon,
      },
      {
        to: "/creator-hub",
        titleKey: "MainHeader.menu.creatorHub.title",
        iconComponent: CreatorHubIcon,
      },
      {
        to: "/my-profile",
        titleKey: "MainHeader.menu.myProfile.title",
        icon: "person",
      },
    ],
  },
  {
    title: "Comms",
    icon: "chat",
    items: [
      {
        to: "/nostr-messenger",
        titleKey: "MainHeader.menu.nostrMessenger.title",
        icon: "chat",
      },
      {
        to: "/nostr-login",
        titleKey: "MainHeader.menu.nostrLogin.title",
        icon: "vpn_key",
      },
    ],
  },
  {
    title: "System",
    icon: "settings",
    items: [
      {
        to: "/settings",
        titleKey: "MainHeader.menu.settings.title",
        icon: "settings",
      },
      {
        to: "/restore",
        titleKey: "MainHeader.menu.restore.title",
        icon: "settings_backup_restore",
      },
      {
        to: "/already-running",
        titleKey: "MainHeader.menu.alreadyRunning.title",
        icon: "warning",
      },
      {
        to: "/welcome",
        titleKey: "MainHeader.menu.welcome.title",
        icon: "info",
      },
      {
        to: "/terms",
        titleKey: "MainHeader.menu.terms.title",
        icon: "gavel",
      },
    ],
  },
];

const tocItems = [
  { id: "vision", label: t("AboutPage.toc.vision") || "Vision" },
  {
    id: "site-overview",
    label: t("AboutPage.siteOverview.title") || "Site Overview",
  },
  { id: "how-it-works", label: "How Ecash Works" },
  { id: "who-for", label: "Who It’s For" },
  { id: "navigation-map", label: "Navigation Map" },
  { id: "trust", label: "Transparency" },
  { id: "faq", label: "FAQ" },
  { id: "cta", label: "Get Started" },
];

let spyObserver: IntersectionObserver | null = null;

const donationLink = `lightning:${import.meta.env.VITE_DONATION_LIGHTNING || ''}`;

// navigation items for the navigation map
const navigationItems = useNavigationItems();

type Faq = { q: string; a: string | string[] };
const faqs: Faq[] = [
  {
    q: "What if a fan stops paying?",
    a: "Creator view » Their timelocked token never unlocks for you. Fundstr flags the user as “Expired” and hides future paid posts. Fan view » You simply don’t renew. No recurring pull, no surprise charges.",
  },
  {
    q: "Can I withdraw to a Lightning wallet?",
    a: "Yes. Go to Wallet → Send → Lightning Invoice, paste the invoice from any external wallet; Fundstr melts the tokens at the mint and pays it.",
  },
  {
    q: "How private is this really?",
    a: [
      "Mints see withdraw/redeem events but cannot correlate them.",
      "Nostr chats are E2E encrypted; Nutzaps use P2PK so only the intended receiver can claim them.",
      "Choose different mints or buckets to compartmentalise further.",
    ],
  },
  {
    q: "What exactly is Cashu and how is it different from regular Bitcoin or Lightning wallets?",
    a: "Cashu uses Chaumian e‑cash, allowing the mint to issue anonymized tokens. Unlike typical wallets, your transactions never appear on the blockchain, and the mint cannot link where your tokens are spent.",
  },
  {
    q: "Do I need to trust a mint, and what happens if a mint goes offline?",
    a: "A mint is required to issue and redeem tokens. If it disappears, any tokens it issued become unusable. To reduce risk, you can hold small balances, spread funds across multiple mints, and withdraw or swap tokens when you suspect a mint might fail.",
  },
  {
    q: "Can the mint freeze my funds or block me?",
    a: "Mints can't freeze or claw back your tokens once issued. However, they can refuse new tokens from you. That's why diversification is key — use multiple mints if you're worried about any single provider.",
  },
  {
    q: "How do subscriptions work without recurring pulls?",
    a: "Fans prepay using timelocked tokens. When the period ends, the tokens are refunded if unspent. Creators receive funds when they publish and fans unlock content manually.",
  },
  {
    q: "What happens if someone steals my tokens?",
    a: "Ecash is bearer-based — whoever holds the tokens can spend them. Use device security and avoid sharing tokens. Soon: token backups and swap support.",
  },
  {
    q: "Is there a limit to how many mints I can use?",
    a: "No hard limit. Fundstr lets you add multiple mints and buckets. Each mint tracks your tokens separately.",
  },
  {
    q: "Can I zap creators on Nostr with ecash?",
    a: "Yes. Nutzaps use a Nostr event with an embedded ecash token. Only the intended receiver can claim it.",
  },
  {
    q: "What’s the difference between buckets and mints?",
    a: "Mints are custodians issuing tokens; buckets are like wallets within a mint. Use buckets to organise funds or separate activities.",
  },
  {
    q: "Does the app work offline?",
    a: "You can view balances, buckets, and message history offline. Creating or redeeming tokens, chatting, and nutzap processing require an internet connection to reach the mint and Nostr relays.",
  },
  {
    q: "Is the code open source and can I run it myself?",
    a: "Yes. The entire project is MIT‑licensed. You can review, fork, or self‑host the repository. Advanced users can also run their own mint and point the wallet at it for full control over issuance and redemption.",
  },
];
const faqSearch = ref("");
const filteredFaqs = computed(() =>
  faqs.filter((f) => f.q.toLowerCase().includes(faqSearch.value.toLowerCase()))
);

onMounted(() => {
  const root = document;
  const existing = tocItems.filter((it) => root.getElementById(it.id));
  const links = Array.from(
    document.querySelectorAll<HTMLAnchorElement>("#about-toc .toc-link")
  );
  const targets = existing.map((it) => root.getElementById(it.id)!);
  spyObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort(
          (a, b) =>
            Math.abs(a.boundingClientRect.top) -
            Math.abs(b.boundingClientRect.top)
        );
      if (visible[0]) {
        const id = visible[0].target.id;
        links.forEach((a) =>
          a.classList.toggle("active", a.dataset.target === id)
        );
      }
    },
    { rootMargin: "-30% 0px -65% 0px", threshold: [0, 0.25, 0.5, 1] }
  );
  targets.forEach((el) => spyObserver!.observe(el));
});

onBeforeUnmount(() => {
  if (spyObserver) spyObserver.disconnect();
});

onMounted(() => {
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
        }
      });
    });

    document.querySelectorAll(".fade-in-section").forEach((el) => {
      observer.observe(el);
    });
  } else {
    document
      .querySelectorAll(".fade-in-section")
      .forEach((el) => el.classList.add("is-visible"));
  }
});
</script>

<style scoped>
.about-page {
  --color-accent: var(--accent-500);
  --color-accent-rgb: var(--accent-500-rgb, 34, 211, 238);
  font-family: "Inter", sans-serif;
  background-color: var(--surface-1);
  background-image: radial-gradient(var(--surface-2) 1px, transparent 1px);
  background-size: 20px 20px;
  color: var(--text-1);
}

.gradient-text {
  background: linear-gradient(90deg, var(--accent-500), var(--accent-600));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.gradient-bg {
  background: linear-gradient(90deg, var(--accent-500), var(--accent-600));
}

.interactive-card {
  background-color: var(--surface-2);
  color: var(--text-1);
  backdrop-filter: blur(4px);
  border: 1px solid var(--surface-contrast-border);
  border-radius: 0.75rem;
  transition: all 0.3s ease;
  text-decoration: none;
}

.interactive-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 0 25px rgba(var(--color-accent-rgb), 0.2);
  border-color: var(--accent-200);
  text-decoration: none;
}

.interactive-card p {
  overflow-wrap: anywhere;
  word-break: break-word;
}

.accordion-item {
  transition: background-color 0.3s;
}

.accordion-item.open {
  background-color: rgba(var(--color-accent-rgb), 0.15);
}

.accordion-item .q-expansion-item__toggle-icon {
  transition: transform 0.3s;
}

.accordion-item.open .q-expansion-item__toggle-icon {
  transform: rotate(180deg);
}

.fade-in-section {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.6s ease-out, transform 0.6s ease-out;
}

.fade-in-section.is-visible {
  opacity: 1;
  transform: none;
}

blockquote {
  border-left: 4px solid var(--color-accent);
  padding-left: 1rem;
  font-style: italic;
}

.alpha-warning {
  background-color: var(--surface-2);
  border: 1px solid var(--accent-200);
  color: var(--text-1);
  border-radius: 0.5rem;
  padding: 1rem;
  box-shadow: 0 0 10px rgba(var(--color-accent-rgb), 0.25);
}

.toc-link {
  opacity: 0.75;
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.toc-link:hover {
  opacity: 1;
}
.toc-link.active {
  opacity: 1;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 4px;
}

#how-it-works .how-step {
  position: relative;
}

#how-it-works .how-step:not(:last-child)::after {
  content: "";
  position: absolute;
  background-color: var(--text-1);
}

#how-it-works .how-step:not(:last-child)::before {
  content: "";
  position: absolute;
  border-style: solid;
  border-color: transparent;
}

@media (min-width: 768px) {
  #how-it-works .how-step:not(:last-child)::after {
    top: 50%;
    right: -2rem;
    width: 2rem;
    height: 2px;
    transform: translateY(-50%);
  }

  #how-it-works .how-step:not(:last-child)::before {
    top: 50%;
    right: -2rem;
    transform: translate(100%, -50%);
    border-width: 5px 0 5px 5px;
    border-color: transparent transparent transparent var(--text-1);
  }
}

@media (max-width: 767px) {
  #how-it-works .how-step:not(:last-child)::after {
    left: 50%;
    bottom: -2rem;
    width: 2px;
    height: 2rem;
    transform: translateX(-50%);
  }

  #how-it-works .how-step:not(:last-child)::before {
    left: 50%;
    bottom: -2rem;
    transform: translate(-50%, 100%);
    border-width: 5px 5px 0 5px;
    border-color: var(--text-1) transparent transparent transparent;
  }
}

</style>
