<template>
  <div>
    <div class="row items-center q-gutter-md q-mb-md">
      <q-select v-model="sort" :options="sortOptions" label="Sort" dense outlined style="min-width:140px" />
      <q-select v-model="region" :options="regionOptions" label="Region" dense outlined clearable style="min-width:140px" />
      <q-space />
      <q-input v-model="customUrl" label="Custom URL" dense outlined class="col" />
      <q-btn color="primary" :disable="!customUrl" label="Add" @click="addCustom" />
      <q-btn dense flat icon="info" @click="info = true" />
    </div>
    <div class="row q-col-gutter-md">
      <div v-for="m in sortedMints" :key="m.url" class="col-12 col-sm-6 col-md-4">
        <MintCard :mint="m" @select="selectMint" />
      </div>
    </div>
    <MintInfoDrawer v-model="info" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useMintsStore } from 'src/stores/mints'
import { MINTS, type MintInfo } from 'src/data/mints'
import MintCard from './MintCard.vue'
import MintInfoDrawer from './MintInfoDrawer.vue'

interface MintState extends MintInfo {
  status: 'pending' | 'ok' | 'fail'
  latencyMs: number | null
}

const mints = ref<MintState[]>(MINTS.map(m => ({ ...m, status: 'pending', latencyMs: null })))
const sort = ref<'latency' | 'alpha'>('latency')
const region = ref<string | null>(null)
const info = ref(false)
const customUrl = ref('')

const sortOptions = [
  { label: 'Latency', value: 'latency' },
  { label: 'Alphabetical', value: 'alpha' },
]
const regionOptions = computed(() => {
  const regions = Array.from(new Set(MINTS.map(m => m.region).filter(Boolean))) as string[]
  return regions.map(r => ({ label: r, value: r }))
})

const sortedMints = computed(() => {
  let arr = mints.value.filter(m => !region.value || m.region === region.value)
  if (sort.value === 'alpha') {
    arr = [...arr].sort((a, b) => a.name.localeCompare(b.name))
  } else {
    arr = [...arr].sort((a, b) => (a.latencyMs ?? Infinity) - (b.latencyMs ?? Infinity))
  }
  return arr
})

onMounted(() => {
  mints.value.forEach(m => pingMint(m))
})

async function pingMint(m: MintState) {
  const start = performance.now()
  try {
    await fetch(m.url + '/info', { method: 'GET', mode: 'no-cors' })
    m.latencyMs = Math.round(performance.now() - start)
    m.status = 'ok'
  } catch (e) {
    m.latencyMs = null
    m.status = 'fail'
  }
}

const store = useMintsStore()
const emit = defineEmits<{ (e: 'selected'): void }>()

async function selectMint(url: string) {
  await store.addMint(url)
  await store.activateMintUrl(url)
  emit('selected')
}

async function addCustom() {
  const url = customUrl.value.trim()
  if (!url) return
  await store.addMint(url)
  await store.activateMintUrl(url)
  customUrl.value = ''
  emit('selected')
}
</script>
