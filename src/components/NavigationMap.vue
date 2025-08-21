<template>
  <div id="map-container" class="mt-8 text-left" ref="mapContainer">
    <q-tabs
      v-model="mode"
      align="center"
      dense
      class="mb-6"
      aria-label="Toggle between fan and creator modes"
      :active-color="mode === 'fan' ? 'accent' : 'primary'"
      :indicator-color="mode === 'fan' ? 'accent' : 'primary'"
    >
      <q-tab name="fan" label="Fan" :aria-selected="mode === 'fan'" />
      <q-tab name="creator" label="Creator" :aria-selected="mode === 'creator'" />
    </q-tabs>
    <q-list class="accordion">
      <q-expansion-item
        v-for="(item, idx) in items"
        :key="item.id"
        :label="item.menuItem"
        :icon="item.icon"
        group="navigation"
        class="border-b accordion-item"
        :class="{ open: openIndex === idx }"
        @show="onShow(idx, item)"
        @hide="openIndex = null"
        expand-icon="keyboard_arrow_down"
        expanded-icon="keyboard_arrow_down"
      >
        <div class="px-4 pb-4 text-sm">
          <div class="fan-content">
            <h4 class="font-semibold mb-2">{{ $t('AboutPage.navigation.fanPerspective') }}</h4>
            <p>{{ item.fanText }}</p>
          </div>
          <div class="creator-content">
            <h4 class="font-semibold mb-2">{{ $t('AboutPage.navigation.creatorPerspective') }}</h4>
            <p>{{ item.creatorText }}</p>
          </div>
        </div>
      </q-expansion-item>
    </q-list>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NavigationItem } from 'src/composables/navigationItems'

const props = defineProps<{ items: NavigationItem[] }>()
const emit = defineEmits<{ (e: 'opened', item: NavigationItem): void }>()

const { t } = useI18n()
const mode = ref<'fan' | 'creator'>('fan')
const mapContainer = ref<HTMLElement | null>(null)
const openIndex = ref<number | null>(null)

function onShow(idx: number, item: NavigationItem) {
  openIndex.value = idx
  emit('opened', item)
}

watch(mode, (val) => {
  if (mapContainer.value) {
    mapContainer.value.classList.toggle('fan-mode', val === 'fan')
    mapContainer.value.classList.toggle('creator-mode', val === 'creator')
  }
})

onMounted(() => {
  if (mapContainer.value) {
    mapContainer.value.classList.add('fan-mode')
  }
})
</script>

<style scoped>
.fan-mode .creator-content {
  display: none;
}
.creator-mode .fan-content {
  display: none;
}
</style>
