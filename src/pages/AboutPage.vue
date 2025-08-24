<template>
  <div class="about-page antialiased">
    <!-- Header -->
    <header class="pt-24 pb-12 fade-in-section">
      <BaseContainer class="text-center">
        <h1 class="text-5xl md:text-7xl font-extrabold mb-6">
          About <span class="gradient-text">Fundstr</span>
        </h1>
        <p class="text-lg md:text-xl max-w-prose mx-auto">
          A privacy-first Bitcoin wallet, social chat, and creator-monetisation
          hub built on the open-source Cashu ecash protocol and the decentralised
          Nostr network.
        </p>
      </BaseContainer>
    </header>
    <div class="alpha-warning fade-in-section">
      <BaseContainer class="flex items-start gap-3" role="alert">
        <q-icon name="warning" size="32px" class="text-accent" aria-hidden="true" />
        <p>
          Fundstr is experimental alpha software. Features may break or change,
          and loss of funds is possible. Use only small amounts you can afford
          to lose.
        </p>
      </BaseContainer>
    </div>

    <!-- Vision -->
    <section id="vision" class="py-12 md:py-20 fade-in-section">
      <BaseContainer class="text-center">
        <h2 class="text-3xl md:text-5xl font-bold mb-6 gradient-text">
          Your Money, Your Network
        </h2>
        <p class="text-lg md:text-xl max-w-prose mx-auto">
          We believe in a world where your financial life and social
          interactions are truly your own. Fundstr is an experiment in creating
          a parallel, peer-to-peer economy—free from corporate gatekeepers,
          surveillance, and unpredictable fees. It’s a gateway to a more
          sovereign way of connecting and transacting.
        </p>
      </BaseContainer>
    </section>

    <!-- Site Overview -->
    <section id="site-overview" class="py-12 md:py-20 fade-in-section">
      <BaseContainer class="text-center">
        <h2 class="text-3xl md:text-5xl font-bold mb-6 gradient-text">
          {{ $t("AboutPage.siteOverview.title") }}
        </h2>
        <div
          class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 text-left"
        >
          <router-link
            v-for="card in siteOverviewCards"
            :key="card.route"
            :to="card.route"
            class="interactive-card block no-underline p-6 md:p-8 flex flex-col cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-500"
            :aria-label="$t(card.titleKey)"
          >
            <component
              v-if="card.iconComponent"
              :is="card.iconComponent"
              class="w-8 h-8 mb-4 text-accent"
              aria-hidden="true"
            />
            <q-icon
              v-else
              :name="card.icon"
              size="32px"
              class="mb-4 text-accent"
              aria-hidden="true"
            />
            <p class="text-accent font-semibold">
              {{ tOr(card.titleKey) }}
            </p>
            <p class="text-sm mt-2">
              {{ tOr(card.descriptionKey) }}
            </p>
          </router-link>
        </div>
      </BaseContainer>
    </section>

    <!-- How Ecash Works -->
    <section id="how-it-works" class="py-12 md:py-20 fade-in-section">
      <BaseContainer class="text-center">
        <h2 class="text-3xl md:text-5xl font-bold mb-6 gradient-text">
          How Ecash Works
        </h2>
        <p class="text-lg md:text-xl mb-12 max-w-prose mx-auto">
          The loop is simple: Bitcoin in → private e-cash out → social payments
          everywhere.
        </p>
        <div class="flex flex-col md:flex-row items-center justify-center gap-8">
          <div class="flex flex-col items-center text-center max-w-xs">
            <q-icon name="currency_bitcoin" size="32px" class="mb-4 text-accent" aria-hidden="true" />
            <h3 class="font-semibold text-lg mb-1">Your Bitcoin</h3>
            <p class="text-sm">From any wallet</p>
          </div>
          <q-icon name="arrow_downward" size="32px" class="md:hidden text-1" aria-hidden="true" />
          <q-icon name="arrow_forward" size="32px" class="hidden md:block text-1" aria-hidden="true" />
          <div class="flex flex-col items-center text-center max-w-xs">
            <q-icon name="account_balance" size="32px" class="mb-4 text-accent" aria-hidden="true" />
            <h3 class="font-semibold text-lg mb-1">The Mint</h3>
            <p class="text-sm">Issues ecash tokens</p>
          </div>
          <q-icon name="arrow_downward" size="32px" class="md:hidden text-1" aria-hidden="true" />
          <q-icon name="arrow_forward" size="32px" class="hidden md:block text-1" aria-hidden="true" />
          <div class="flex flex-col items-center text-center max-w-xs">
            <q-icon name="account_balance_wallet" size="32px" class="mb-4 text-accent" aria-hidden="true" />
            <h3 class="font-semibold text-lg mb-1">Fundstr Wallet</h3>
            <p class="text-sm">Spend privately</p>
          </div>
        </div>
      </BaseContainer>
    </section>

    <!-- Built for the Sovereign Individual -->
    <section id="who-for" class="py-12 md:py-20 fade-in-section">
      <BaseContainer class="text-center">
        <h2 class="text-3xl md:text-5xl font-bold mb-12 gradient-text">
          Built for the Sovereign Individual
        </h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <!-- Card 1 -->
          <div class="interactive-card p-6 flex flex-col items-center text-center h-full focus:outline-none focus:ring-2 focus:ring-accent-500">
            <q-icon name="brush" size="32px" class="mb-4 text-accent" aria-hidden="true" />
            <h3 class="font-semibold text-lg mb-2">Content Creators</h3>
            <p class="text-sm">
              Monetize your audience directly, free from de-platforming and high
              fees.
            </p>
          </div>

          <!-- Card 2 -->
          <div class="interactive-card p-6 flex flex-col items-center text-center h-full focus:outline-none focus:ring-2 focus:ring-accent-500">
            <q-icon name="shield" size="32px" class="mb-4 text-accent" aria-hidden="true" />
            <h3 class="font-semibold text-lg mb-2">Privacy Advocates</h3>
            <p class="text-sm">
              Transact with confidence that your financial life isn't being
              tracked.
            </p>
          </div>

          <!-- Card 3 -->
          <div class="interactive-card p-6 flex flex-col items-center text-center h-full focus:outline-none focus:ring-2 focus:ring-accent-500">
            <q-icon name="link" size="32px" class="mb-4 text-accent" aria-hidden="true" />
            <h3 class="font-semibold text-lg mb-2">Nostr Users</h3>
            <p class="text-sm">
              Upgrade your zaps to be truly private and integrate payments
              seamlessly.
            </p>
          </div>

          <!-- Card 4 -->
          <div class="interactive-card p-6 flex flex-col items-center text-center h-full focus:outline-none focus:ring-2 focus:ring-accent-500">
            <q-icon name="public" size="32px" class="mb-4 text-accent" aria-hidden="true" />
            <h3 class="font-semibold text-lg mb-2">Global Citizens</h3>
            <p class="text-sm">
              Move value across borders instantly, without relying on
              traditional banking.
            </p>
          </div>
        </div>
      </BaseContainer>
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
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <!-- Card 1 -->
          <details class="interactive-card p-6 text-left">
            <summary class="cursor-pointer">
              <span class="block text-4xl mb-4">🐙</span>
              <span class="block font-semibold text-xl mb-2"
                >Open Source & Verifiable</span
              >
              <span class="block text-sm"
                >Fundstr is built on open-source code. We invite you to inspect,
                verify, and contribute. Transparency is our core
                principle.</span
              >
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
          <details class="interactive-card p-6 text-left">
            <summary class="cursor-pointer">
              <span class="block text-4xl mb-4">🔑</span>
              <span class="block font-semibold text-xl mb-2"
                >You Hold the Keys</span
              >
              <span class="block text-sm"
                >You are the sole holder of your ecash tokens and Nostr
                identity. Mints act as custodians for the underlying Bitcoin,
                but only you can spend your ecash.</span
              >
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
          <details class="interactive-card p-6 text-left">
            <summary class="cursor-pointer">
              <span class="block text-4xl mb-4">🛡️</span>
              <span class="block font-semibold text-xl mb-2"
                >Unbreakable Privacy</span
              >
              <span class="block text-sm"
                >Thanks to Chaumian blind signatures, mints cannot link your
                deposits to your withdrawals. Your spending habits remain
                completely private.</span
              >
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
          <details class="interactive-card p-6 text-left">
            <summary class="cursor-pointer">
              <span class="block text-4xl mb-4">🪙</span>
              <span class="block font-semibold text-xl mb-2"
                >Mint Diversification</span
              >
              <span class="block text-sm"
                >Fundstr supports multiple mints, allowing you to diversify your
                holdings. Our audit tools will warn you (⚠️) of any unusual mint
                behavior.</span
              >
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
      <BaseContainer>
        <h2
          class="text-3xl md:text-5xl font-bold mb-12 text-center gradient-text"
        >
          Frequently Asked Questions
        </h2>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Q1 -->
          <details class="interactive-card p-4">
            <summary class="cursor-pointer font-semibold text-lg">
              What if a fan stops paying?
            </summary>
            <p class="mt-4 text-sm">
              Creator view » Their timelocked token never unlocks for you.
              Fundstr flags the user as “Expired” and hides future paid posts.
              Fan view » You simply don’t renew. No recurring pull, no surprise
              charges.
            </p>
          </details>

          <!-- Q2 -->
          <details class="interactive-card p-4">
            <summary class="cursor-pointer font-semibold text-lg">
              Can I withdraw to a Lightning wallet?
            </summary>
            <p class="mt-4 text-sm">
              Yes. Go to Wallet → Send → Lightning Invoice, paste the invoice
              from any external wallet; Fundstr melts the tokens at the mint and
              pays it.
            </p>
          </details>

          <!-- Q3 -->
          <details class="interactive-card p-4">
            <summary class="cursor-pointer font-semibold text-lg">
              How private is this really?
            </summary>
            <ul class="mt-4 text-sm list-disc pl-6 space-y-1">
              <li>
                Mints see withdraw/redeem events but cannot correlate them.
              </li>
              <li>
                Nostr chats are E2E encrypted; Nutzaps use P2PK so only the
                intended receiver can claim them.
              </li>
              <li>
                Choose different mints or buckets to compartmentalise further.
              </li>
            </ul>
          </details>

          <!-- Q4 -->
          <details class="interactive-card p-4">
            <summary class="cursor-pointer font-semibold text-lg">
              What exactly is Cashu and how is it different from regular Bitcoin
              or Lightning wallets?
            </summary>
            <p class="mt-4 text-sm">
              Cashu uses Chaumian e‑cash, allowing the mint to issue anonymized
              tokens. Unlike typical wallets, your transactions never appear on
              the blockchain, and the mint cannot link where your tokens are
              spent.
            </p>
          </details>

          <!-- Q5 -->
          <details class="interactive-card p-4">
            <summary class="cursor-pointer font-semibold text-lg">
              Do I need to trust a mint, and what happens if a mint goes
              offline?
            </summary>
            <p class="mt-4 text-sm">
              A mint is required to issue and redeem tokens. If it disappears,
              any tokens it issued become unusable. To reduce risk, you can hold
              small balances, spread funds across multiple mints, and withdraw
              or swap tokens when you suspect a mint might fail.
            </p>
          </details>

          <!-- Q6 -->
          <details class="interactive-card p-4">
            <summary class="cursor-pointer font-semibold text-lg">
              How can I back up or restore my wallet?
            </summary>
            <p class="mt-4 text-sm">
              During setup you can generate a BIP‑39 seed. Record it safely; if
              your device is lost, reinstall the app, enter the seed, and
              reconnect to your mints to restore unspent tokens. Without a seed
              or token export, lost devices mean lost funds.
            </p>
          </details>

          <!-- Q7 -->
          <details class="interactive-card p-4">
            <summary class="cursor-pointer font-semibold text-lg">
              What are “Buckets” and why would I use them?
            </summary>
            <p class="mt-4 text-sm">
              Buckets act like sub‑accounts. You can allocate tokens to
              categories (e.g., savings, subscriptions) and move funds between
              buckets instantly, which helps with budgeting or keeping project
              funds separate.
            </p>
          </details>

          <!-- Q8 -->
          <details class="interactive-card p-4">
            <summary class="cursor-pointer font-semibold text-lg">
              How does the Nostr integration work?
            </summary>
            <p class="mt-4 text-sm">
              The app can generate or import a Nostr key pair, connect to
              relays, and send encrypted DMs. This enables token transfers and
              tipping directly through Nostr events without exposing invoices or
              addresses.
            </p>
          </details>

          <!-- Q9 -->
          <details class="interactive-card p-4">
            <summary class="cursor-pointer font-semibold text-lg">
              What are Nutzaps and how do I receive them?
            </summary>
            <p class="mt-4 text-sm">
              Nutzaps let users send Cashu tokens as Nostr “zap” events. Publish
              your NIP‑61 profile (the app guides you), and others can tip you
              using ecash locked to your Nostr wallet key, keeping the payment
              private yet publicly verifiable.
            </p>
          </details>

          <!-- Q10 -->
          <details class="interactive-card p-4">
            <summary class="cursor-pointer font-semibold text-lg">
              Can I connect the wallet to other Nostr‑enabled apps?
            </summary>
            <p class="mt-4 text-sm">
              Yes. Nostr Wallet Connect (NWC) provides a QR code and secret key.
              Pair it with supported apps, and they can request payments or
              signatures through Nostr events that you approve inside the
              wallet.
            </p>
          </details>

          <!-- Q11 -->
          <details class="interactive-card p-4">
            <summary class="cursor-pointer font-semibold text-lg">
              Are there any fees for using Cashu tokens?
            </summary>
            <p class="mt-4 text-sm">
              Sending tokens between users is free. Fees may apply when minting
              or melting tokens via Lightning, depending on the mint’s policy
              and Lightning network costs. The app shows mint‑specific fees
              before you confirm a transaction.
            </p>
          </details>

          <!-- Q12 -->
          <details class="interactive-card p-4">
            <summary class="cursor-pointer font-semibold text-lg">
              Does the app work offline?
            </summary>
            <p class="mt-4 text-sm">
              You can view balances, buckets, and message history offline.
              Creating or redeeming tokens, chatting, and nutzap processing
              require an internet connection to reach the mint and Nostr relays.
            </p>
          </details>

          <!-- Q13 -->
          <details class="interactive-card p-4">
            <summary class="cursor-pointer font-semibold text-lg">
              Is the code open source and can I run it myself?
            </summary>
            <p class="mt-4 text-sm">
              Yes. The entire project is MIT‑licensed. You can review, fork, or
              self‑host the repository. Advanced users can also run their own
              mint and point the wallet at it for full control over issuance and
              redemption.
            </p>
          </details>
        </div>
      </BaseContainer>
    </section>

    <!-- Footer -->
    <footer class="px-4">
      <!-- Community -->
      <section class="py-16 fade-in-section">
        <div class="max-w-4xl mx-auto text-center">
          <h2 class="text-3xl md:text-5xl font-bold mb-6 gradient-text">
            Join the Conversation
          </h2>
          <p class="mb-6">
            Follow the project and its creator on Nostr to stay up-to-date and
            connect with the community.
          </p>
          <div
            class="flex flex-col sm:flex-row justify-center gap-4 text-accent"
          >
            <a
              href="https://primal.net/KalonAxiarch"
              target="_blank"
              rel="noopener noreferrer"
              class="interactive-card px-6 py-3 flex items-center justify-center gap-2"
              >👤 Creator's Profile</a
            >
            <a
              href="#"
              class="interactive-card px-6 py-3 flex items-center justify-center gap-2"
              >🚀 Fundstr Project Page</a
            >
            <a
              href="/find-creators?npub=npub1aljmhjp5tqrw3m60ra7t3u8uqq223d6rdg9q0h76a8djd9m4hmvsmlj82m"
              class="interactive-card px-6 py-3 flex items-center justify-center gap-2"
              >💰 View KalonAxiarch's Tiers</a
            >
          </div>
        </div>
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
      <section id="cta" class="py-16 fade-in-section">
        <div class="max-w-4xl mx-auto text-center">
          <h2 class="text-3xl md:text-5xl font-bold mb-6 gradient-text">
            Ready to Join the Movement?
          </h2>
          <p class="mb-8">
            Install the PWA, explore the code, or help fund development.
          </p>
          <div class="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href="#"
              class="px-8 py-3 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
              >Install PWA</a
            >
            <a
              href="#"
              class="px-8 py-3 rounded-full gradient-bg text-white font-semibold"
              >Support Fundstr</a
            >
          </div>
        </div>
      </section>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, type Component } from "vue";
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

interface SiteOverviewCard {
  route: string;
  titleKey: string;
  descriptionKey: string;
  icon?: string;
  iconComponent?: Component;
}

const siteOverviewCards: SiteOverviewCard[] = [
  {
    route: "/wallet",
    titleKey: "MainHeader.menu.wallet.title",
    descriptionKey: "AboutPage.siteOverview.wallet.description",
    icon: "account_balance_wallet",
  },
  {
    route: "/find-creators",
    titleKey: "MainHeader.menu.findCreators.title",
    descriptionKey: "AboutPage.siteOverview.findCreators.description",
    iconComponent: FindCreatorsIcon,
  },
  {
    route: "/creator-hub",
    titleKey: "MainHeader.menu.creatorHub.title",
    descriptionKey: "AboutPage.siteOverview.creatorHub.description",
    iconComponent: CreatorHubIcon,
  },
  {
    route: "/my-profile",
    titleKey: "MainHeader.menu.myProfile.title",
    descriptionKey: "AboutPage.siteOverview.myProfile.description",
    icon: "person",
  },
  {
    route: "/buckets",
    titleKey: "MainHeader.menu.buckets.title",
    descriptionKey: "AboutPage.siteOverview.buckets.description",
    icon: "inventory_2",
  },
  {
    route: "/subscriptions",
    titleKey: "MainHeader.menu.subscriptions.title",
    descriptionKey: "AboutPage.siteOverview.subscriptions.description",
    icon: "auto_awesome_motion",
  },
  {
    route: "/nostr-messenger",
    titleKey: "MainHeader.menu.nostrMessenger.title",
    descriptionKey: "AboutPage.siteOverview.nostrMessenger.description",
    icon: "chat",
  },
  {
    route: "/settings",
    titleKey: "MainHeader.menu.settings.title",
    descriptionKey: "AboutPage.siteOverview.settings.description",
    icon: "settings",
  },
  {
    route: "/restore",
    titleKey: "MainHeader.menu.restore.title",
    descriptionKey: "AboutPage.siteOverview.restore.description",
    icon: "settings_backup_restore",
  },
  {
    route: "/already-running",
    titleKey: "MainHeader.menu.alreadyRunning.title",
    descriptionKey: "AboutPage.siteOverview.alreadyRunning.description",
    icon: "warning",
  },
  {
    route: "/welcome",
    titleKey: "MainHeader.menu.welcome.title",
    descriptionKey: "AboutPage.siteOverview.welcome.description",
    icon: "info",
  },
  {
    route: "/terms",
    titleKey: "MainHeader.menu.terms.title",
    descriptionKey: "AboutPage.siteOverview.terms.description",
    icon: "gavel",
  },
  {
    route: "/nostr-login",
    titleKey: "MainHeader.menu.nostrLogin.title",
    descriptionKey: "AboutPage.siteOverview.nostrLogin.description",
    icon: "vpn_key",
  },
];

// navigation items for the navigation map
const navigationItems = useNavigationItems();

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

</style>
