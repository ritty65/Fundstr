<template>
  <div class="about-page antialiased">
    <div class="max-w-screen-xl mx-auto px-4 py-16 space-y-24">
      <!-- Hero -->
      <section>
        <h1 class="text-5xl md:text-7xl font-extrabold mb-12 text-center md:text-left">
          About <span class="gradient-text">Fundstr</span>
        </h1>
        <div class="grid md:grid-cols-12 gap-6 items-start mb-8">
          <div class="md:col-span-6">
            <div class="interactive-card p-6 h-full">
              <h2 class="font-semibold text-xl mb-4">Your Money</h2>
              <ul class="list-disc pl-5 space-y-2 text-sm">
                <li>Private payments</li>
                <li>Open protocols</li>
                <li>No corporate gatekeepers</li>
                <li>No surveillance</li>
                <li>Predictable fees</li>
              </ul>
            </div>
          </div>
          <div class="md:col-span-6">
            <div class="interactive-card p-6 h-full flex items-start gap-3" role="alert">
              <q-icon name="warning" size="32px" class="text-accent" aria-hidden="true" />
              <p class="text-sm">
                Fundstr is experimental alpha software. Features may break or change, and
                loss of funds is possible. Use only small amounts you can afford to lose.
              </p>
            </div>
          </div>
        </div>
        <p class="text-lg md:text-xl max-w-prose">
          A privacy-first Bitcoin wallet, social chat, and creator-monetisation hub built on the
          open-source Cashu ecash protocol and the decentralised Nostr network.
        </p>
      </section>

      <!-- Site Overview -->
      <section id="site-overview" class="space-y-12">
        <h2 class="text-3xl md:text-5xl font-bold text-center gradient-text">Site Overview</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 text-left items-stretch">
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
            <ul class="space-y-2 text-sm flex-1">
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

      <!-- How Cash Works -->
      <section id="cash-works" class="space-y-12">
        <h2 class="text-3xl md:text-5xl font-bold text-center gradient-text">How Cash Works</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div
            v-for="(step, idx) in howSteps"
            :key="step.title"
            class="interactive-card p-6 flex flex-col items-center text-center h-full"
          >
            <q-badge color="accent" outline class="mb-2">{{ idx + 1 }}</q-badge>
            <q-icon :name="step.icon" size="32px" class="mb-4 text-accent" aria-hidden="true" />
            <h3 class="font-semibold mb-2">{{ step.title }}</h3>
            <p class="text-sm">{{ step.text }}</p>
          </div>
        </div>
      </section>

      <!-- Built for the Sovereign Individual -->
      <section id="sovereign" class="space-y-12">
        <h2 class="text-3xl md:text-5xl font-bold text-center gradient-text">
          Built for the Sovereign Individual
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div
            v-for="pill in pillars"
            :key="pill.title"
            class="interactive-card p-6 flex flex-col items-center text-center h-full"
          >
            <q-icon :name="pill.icon" size="32px" class="mb-4 text-accent" aria-hidden="true" />
            <h3 class="font-semibold text-lg mb-2">{{ pill.title }}</h3>
            <p class="text-sm">{{ pill.text }}</p>
          </div>
        </div>
      </section>

      <!-- Trust Through Transparency -->
      <section id="trust" class="space-y-12">
        <h2 class="text-3xl md:text-5xl font-bold text-center gradient-text">
          Trust Through Transparency
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
          <div class="interactive-card p-6 h-full">
            <p class="mb-4">
              Fundstr is open-source software. Code, issues, and discussions happen in the
              open.
            </p>
            <p class="text-sm text-2">Audits and security reviews are ongoing.</p>
          </div>
          <div class="interactive-card p-6 h-full">
            <p class="mb-4">
              Fundstr is non-custodial experimental software. Use at your own risk and keep
              balances small.
            </p>
            <p class="text-sm text-2">No guarantees are provided. You are responsible for your funds.</p>
          </div>
        </div>
      </section>

      <!-- FAQ -->
      <section id="faq" class="space-y-12">
        <h2 class="text-3xl md:text-5xl font-bold text-center gradient-text">
          Frequently Asked Questions
        </h2>
        <div class="max-w-3xl mx-auto">
          <q-expansion-item
            v-for="faq in faqs"
            :key="faq.q"
            group="faq"
            dense
            expand-icon="expand_more"
            class="accordion-item mb-3 bg-surface-2 rounded"
            header-class="q-pa-md"
          >
            <template #header>
              <div class="text-sm font-semibold">{{ faq.q }}</div>
            </template>
            <div class="q-pa-md text-sm">
              <p v-if="typeof faq.a === 'string'">{{ faq.a }}</p>
              <ul v-else class="list-disc pl-5 space-y-1">
                <li v-for="line in faq.a" :key="line">{{ line }}</li>
              </ul>
            </div>
          </q-expansion-item>
        </div>
      </section>

      <!-- Join the Conversation -->
      <section id="conversation" class="space-y-12">
        <h2 class="text-3xl md:text-5xl font-bold text-center gradient-text">
          Join the Conversation
        </h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
          <a
            v-for="link in conversationLinks"
            :key="link.href"
            :href="link.href"
            target="_blank"
            rel="noopener noreferrer"
            class="interactive-card p-6 flex flex-col items-center text-center h-full focus:outline-none focus:ring-2 focus:ring-accent-500"
          >
            <q-icon :name="link.icon" size="32px" class="mb-4 text-accent" aria-hidden="true" />
            <span class="font-semibold">{{ link.label }}</span>
            <q-icon name="open_in_new" size="20px" class="mt-2 text-accent" aria-hidden="true" />
          </a>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import FindCreatorsIcon from 'src/components/icons/FindCreatorsIcon.vue';
import CreatorHubIcon from 'src/components/icons/CreatorHubIcon.vue';

interface ClusterLink {
  to: string;
  titleKey: string;
  icon?: string;
  iconComponent?: unknown;
}

interface Cluster {
  title: string;
  icon: string;
  items: ClusterLink[];
}

interface Step {
  title: string;
  text: string;
  icon: string;
}

interface Pillar {
  title: string;
  text: string;
  icon: string;
}

interface Faq {
  q: string;
  a: string | string[];
}

const { t } = useI18n();

function tOr(key: string) {
  const val = t(key);
  return val === key ? key : val;
}

const overviewClusters: Cluster[] = [
  {
    title: 'Money',
    icon: 'savings',
    items: [
      {
        to: '/wallet',
        titleKey: 'MainHeader.menu.wallet.title',
        icon: 'account_balance_wallet',
      },
      {
        to: '/buckets',
        titleKey: 'MainHeader.menu.buckets.title',
        icon: 'inventory_2',
      },
      {
        to: '/subscriptions',
        titleKey: 'MainHeader.menu.subscriptions.title',
        icon: 'auto_awesome_motion',
      },
    ],
  },
  {
    title: 'Creators',
    icon: 'star',
    items: [
      {
        to: '/find-creators',
        titleKey: 'MainHeader.menu.findCreators.title',
        iconComponent: FindCreatorsIcon,
      },
      {
        to: '/creator-hub',
        titleKey: 'MainHeader.menu.creatorHub.title',
        iconComponent: CreatorHubIcon,
      },
      {
        to: '/my-profile',
        titleKey: 'MainHeader.menu.myProfile.title',
        icon: 'person',
      },
    ],
  },
  {
    title: 'Comms',
    icon: 'chat',
    items: [
      {
        to: '/nostr-messenger',
        titleKey: 'MainHeader.menu.nostrMessenger.title',
        icon: 'chat',
      },
      {
        to: '/nostr-login',
        titleKey: 'MainHeader.menu.nostrLogin.title',
        icon: 'vpn_key',
      },
    ],
  },
  {
    title: 'System',
    icon: 'settings',
    items: [
      {
        to: '/settings',
        titleKey: 'MainHeader.menu.settings.title',
        icon: 'settings',
      },
      {
        to: '/restore',
        titleKey: 'MainHeader.menu.restore.title',
        icon: 'settings_backup_restore',
      },
      {
        to: '/already-running',
        titleKey: 'MainHeader.menu.alreadyRunning.title',
        icon: 'warning',
      },
      {
        to: '/welcome',
        titleKey: 'MainHeader.menu.welcome.title',
        icon: 'info',
      },
    ],
  },
];

const howSteps: Step[] = [
  {
    title: 'Spend',
    text: 'Use ecash like physical cash wherever Fundstr is accepted.',
    icon: 'shopping_cart',
  },
  {
    title: 'Earn',
    text: 'Receive sats instantly from fans and supporters.',
    icon: 'savings',
  },
  {
    title: 'Backed by Bitcoin',
    text: 'Each token is secured by Bitcoin held by the mint.',
    icon: 'currency_bitcoin',
  },
  {
    title: 'Instantly Liquid',
    text: 'Redeem or swap your tokens at any time.',
    icon: 'bolt',
  },
];

const pillars: Pillar[] = [
  {
    title: 'Public Money',
    text: 'Open protocols like Cashu and Nostr keep the network permissionless.',
    icon: 'public',
  },
  {
    title: 'Private Keys',
    text: 'You control your keys and your funds—always.',
    icon: 'vpn_key',
  },
  {
    title: 'Community-Owned',
    text: 'Fundstr is open-source and community funded.',
    icon: 'groups',
  },
];

const faqs: Faq[] = [
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
    a: [
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
    q: 'Can the mint freeze my funds or block me?',
    a: 'Mints cannot freeze or claw back your tokens once issued. However, they can refuse new tokens from you. Diversify across multiple mints if you are concerned about a single provider.',
  },
];

const conversationLinks = [
  {
    href: 'https://primal.net/KalonAxiarch',
    icon: 'person',
    label: "Creator's Profile",
  },
  {
    href: 'https://twitter.com/KalonAxiarch',
    icon: 'mdi-twitter',
    label: 'Follow on Twitter',
  },
  {
    href: 'https://github.com/Fundstr',
    icon: 'code',
    label: 'View on GitHub',
  },
  {
    href: 'https://discord.gg/',
    icon: 'chat',
    label: 'Chat on Discord',
  },
];

</script>

<style scoped>
.about-page {
  background: var(--surface-1);
  color: var(--text-1);
}

.interactive-card {
  background-color: var(--surface-2);
  border: 1px solid var(--surface-contrast-border);
  border-radius: 0.5rem;
  transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
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

.accordion-item .q-expansion-item__toggle-icon {
  transition: transform 0.3s;
}

.accordion-item.q-expansion-item--expanded .q-expansion-item__toggle-icon {
  transform: rotate(180deg);
}
</style>

