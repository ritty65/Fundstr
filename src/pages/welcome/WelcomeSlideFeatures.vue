<template>
  <section role="region" :aria-labelledby="id" class="q-pa-md flex flex-center">
    <div class="text-center">
      <q-icon name="apps" size="4em" color="primary" />
      <h1 :id="id" tabindex="-1" class="q-mt-md">{{ $t('Welcome.features.title') }}</h1>
      <p class="q-mt-sm">{{ $t('Welcome.features.lead') }}</p>
      <NavigationMap :items="navigationItems" @opened="markVisited" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { useWelcomeStore } from 'src/stores/welcome'
import NavigationMap from 'src/components/NavigationMap.vue'
import {
  useNavigationItems,
  type NavigationItem,
} from 'src/composables/navigationItems'

const id = 'welcome-features-title'
const welcome = useWelcomeStore()
const navigationItems = useNavigationItems()

function markVisited(item: NavigationItem) {
  ;(welcome.featuresVisited as any)[item.id] = true
}
</script>

<style scoped>
h1 {
  font-weight: bold;
}
</style>
