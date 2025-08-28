<template>
  <section role="region" :aria-labelledby="id" class="q-pa-md flex flex-center">
    <div class="text-center">
      <q-icon name="apps" size="4em" color="primary" />
      <h1 :id="id" tabindex="-1" class="q-mt-md">{{ $t('Welcome.features.title') }}</h1>
      <p class="q-mt-sm">{{ $t('Welcome.features.lead') }}</p>
      <div class="cards cards--2 q-mt-md">
        <RouterLink
          v-for="feature in features"
          :key="feature.id"
          :to="feature.to"
          class="card feature-card no-underline"
          @click="markVisited(feature.id)"
        >
          <div class="icon-wrapper" aria-hidden="true">
            <component
              v-if="feature.iconComponent"
              :is="feature.iconComponent"
              class="feature-icon"
            />
            <q-icon
              v-else
              :name="feature.icon"
              size="2rem"
              class="feature-icon"
            />
          </div>
          <div class="text-left">
            <div class="feature-label">
              {{ $t(`Welcome.features.bullets.${feature.id}.label`) }}
            </div>
            <p class="feature-desc q-mt-xs">
              {{ $t(`Welcome.features.bullets.${feature.id}.desc`) }}
            </p>
          </div>
        </RouterLink>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useWelcomeStore } from 'src/stores/welcome'
import CreatorHubIcon from 'src/components/icons/CreatorHubIcon.vue'

interface Feature {
  id: string
  to: string
  icon?: string
  iconComponent?: any
}

const id = 'welcome-features-title'
const welcome = useWelcomeStore()

const features: Feature[] = [
  { id: 'creatorHub', to: '/creator-hub', iconComponent: CreatorHubIcon },
  { id: 'subscriptions', to: '/subscriptions', icon: 'auto_awesome_motion' },
  { id: 'buckets', to: '/buckets', icon: 'inventory_2' },
]

function markVisited(id: string) {
  ;(welcome.featuresVisited as any)[id] = true
}
</script>

<style scoped>
.cards {
  display: grid;
  gap: 1rem;
}

.cards--2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

@media (max-width: 640px) {
  .cards--2 {
    grid-template-columns: 1fr;
  }
}

.card {
  background: var(--surface-2);
  border: 1px solid var(--surface-contrast-border);
  border-radius: 1rem;
  padding: 1rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  color: inherit;
}

.feature-icon {
  width: 2rem;
  height: 2rem;
}

.feature-label {
  font-weight: 600;
}

h1 {
  font-weight: bold;
}
</style>
