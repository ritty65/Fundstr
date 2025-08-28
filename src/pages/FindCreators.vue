<template>
  <div class="q-pa-md find-creators">
    <div class="q-mb-md">
      <q-input
        v-model="query"
        label="Search creators"
        debounce="400"
        @update:model-value="onSearch"
        filled
      />
    </div>

    <div v-if="creators.searching">
      <q-skeleton v-for="n in 3" :key="n" type="rect" class="q-mb-md" height="120px" />
    </div>

    <div v-else>
      <div v-if="!creators.searchResults.length" class="text-center text-2 q-mt-xl">
        No results
      </div>
      <div class="row q-col-gutter-md">
        <div
          class="col-12 col-md-6 col-lg-4"
          v-for="c in creators.searchResults"
          :key="c.pubkey"
        >
          <q-card flat bordered class="q-pa-md">
            <div class="row no-wrap items-start">
              <q-avatar size="56px">
                <img :src="proxiedImage(c.profile?.picture)" @error="onImgError" />
              </q-avatar>
              <div class="q-ml-md overflow-hidden">
                <div class="text-subtitle1 ellipsis">
                  {{ c.profile?.name || c.profile?.display_name || c.pubkey.slice(0,8) }}
                </div>
                <div class="text-caption text-2 ellipsis">{{ c.profile?.about }}</div>
              </div>
            </div>
            <div class="row text-caption q-mt-sm">
              <div class="col">Followers: {{ formatCount(c.followers) }}</div>
              <div class="col">Following: {{ formatCount(c.following) }}</div>
            </div>
            <div class="q-mt-sm">
              <q-btn size="sm" class="q-mr-sm" color="primary" label="View" @click="openProfile(c.pubkey)" />
            </div>
          </q-card>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useCreatorsStore } from 'stores/creators'
import { proxiedImage } from '@/utils/image'
import { useRouter } from 'vue-router'
import { nip19 } from 'nostr-tools'
const creators = useCreatorsStore()
const query = ref('')
const router = useRouter()

function onSearch () {
  if (!query.value) {
    creators.loadFeaturedCreators()
  } else {
    creators.searchCreators(query.value)
  }
}

function openProfile (pubkey: string) {
  router.push({ name: 'PublicCreatorProfile', params: { npub: nip19.npubEncode(pubkey) } })
}

function onImgError (ev: Event) {
  (ev.target as HTMLImageElement).src = '/nostr-icon.svg'
}

function formatCount (n: number) {
  return n >= 0 ? n : '—'
}

onMounted(() => {
  creators.loadFeaturedCreators()
})
</script>

<style scoped>
.find-creators {
  max-width: 900px;
  margin: 0 auto;
}
</style>
