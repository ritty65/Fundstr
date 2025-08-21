<template>
  <div class="column q-gutter-md">
    <q-card v-for="card in cards" :key="card.title" flat bordered>
      <q-card-section>
        <div class="text-h6">{{ card.title }}</div>
        <p class="q-mt-xs">{{ card.text }}</p>
        <ul class="q-pl-md q-mt-sm">
          <li v-for="(b, i) in card.bullets" :key="i">{{ b }}</li>
        </ul>
      </q-card-section>
    </q-card>
  </div>
</template>

<script setup lang="ts">
interface Card { title: string; text: string; bullets: string[] }

const cards: Card[] = [
  {
    title: 'Wallet',
    text: 'Home for send/receive.',
    bullets: [
      'Receive via Lightning invoice or token',
      'Send tokens or pay invoices',
      'Works offline for token handoff',
    ],
  },
  {
    title: 'Buckets',
    text: 'Organize your sats by goal.',
    bullets: [
      'Create buckets (rent, tips, savings)',
      'Move tokens between buckets',
      'Optional—power users',
    ],
  },
  {
    title: 'Creator Hub',
    text: 'Publish a profile; get support.',
    bullets: [
      'Set display name and tiers',
      'Share your subscribe link',
      'No platform middleman',
    ],
  },
  {
    title: 'Subscriptions',
    text: 'Manage creators you support.',
    bullets: [
      'See active supports',
      'Edit amounts or cancel',
      'Track history',
    ],
  },
  {
    title: 'Messenger',
    text: 'Private DMs; send tokens.',
    bullets: [
      'Chat over Nostr',
      'Drop a token in chat',
      'End-to-end encrypted',
    ],
  },
  {
    title: 'Settings',
    text: 'Toggles & advanced.',
    bullets: [
      'Add/change mints',
      'Lightning Address & NWC',
      'Backup & appearance',
    ],
  },
  {
    title: 'Restore',
    text: 'Recover your wallet.',
    bullets: [
      'Import backup',
      'Reconcile tokens',
      'Continue where you left off',
    ],
  },
]
</script>
