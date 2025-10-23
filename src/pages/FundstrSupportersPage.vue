<template>
  <q-page class="fundstr-supporters q-pa-xl-xl q-pa-lg-md q-pa-md">
    <div class="hero text-center q-mx-auto">
      <h1 class="text-h3 text-bold q-mb-md">Fundstr Supporters</h1>
      <p class="text-subtitle1 text-2 q-mb-xl">
        These Nostr public keys belong to early supporters and donors who help Fundstr grow.
        We are grateful for their contributions to privacy-preserving creator tools.
      </p>
    </div>

    <div class="supporters-grid row q-col-gutter-lg">
      <div
        v-for="supporter in supporters"
        :key="supporter.npub"
        class="col-12 col-sm-6 col-lg-4"
      >
        <q-card class="supporter-card bg-surface-2 q-pa-lg full-height column no-wrap">
          <div class="row items-center q-gutter-md q-mb-md">
            <q-avatar v-if="supporter.avatarUrl" size="56px">
              <img :src="supporter.avatarUrl" :alt="`${supporter.name} avatar`" />
            </q-avatar>
            <div>
              <div class="text-h6 text-1">{{ supporter.name }}</div>
              <div class="text-caption text-uppercase text-2">Supporter</div>
            </div>
          </div>
          <p class="text-body2 text-1 q-mb-md">{{ supporter.blurb }}</p>
          <q-separator class="q-my-md" inset />
          <div class="npub text-caption text-mono text-2">
            {{ supporter.npub }}
          </div>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { SUPPORTERS } from "src/data/supporters";

const supporters = SUPPORTERS;
</script>

<style scoped>
.fundstr-supporters {
  max-width: 1100px;
  margin: 0 auto;
}

.hero p {
  max-width: 720px;
  margin-left: auto;
  margin-right: auto;
}

.supporter-card {
  border: 1px solid var(--surface-contrast-border, rgba(0, 0, 0, 0.08));
  border-radius: 16px;
  min-height: 260px;
  display: flex;
  justify-content: space-between;
}

.npub {
  word-break: break-all;
}
</style>
