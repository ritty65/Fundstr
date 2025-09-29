<template>
  <q-page class="q-pa-md bg-surface-1 text-1">
    <div class="q-gutter-md">
    <q-card class="q-pa-md bg-surface-2 text-1">
        <div class="text-h5">Buckets</div>
        <div class="text-subtitle2 text-2 q-mb-md">
          Organize your tokens
        </div>
        <SummaryStats :total="totalActiveBalance" :active-count="activeCount" />
      </q-card>

    <q-card class="q-pa-md bg-surface-2 text-1">
        <BucketManager />
      </q-card>
    </div>

    <q-page-sticky
      position="bottom-right"
      :offset="[18, 18]"
      class="bucket-fab"
      scroll-target="body"
    >
      <q-btn
        fab
        color="primary"
        icon="add"
        @click="dialogOpen = true"
        aria-label="Create bucket"
      />
    </q-page-sticky>
    <BucketDialog v-model="dialogOpen" />
  </q-page>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { storeToRefs } from "pinia";
import BucketManager from "components/BucketManager.vue";
import BucketDialog from "components/BucketDialog.vue";
import SummaryStats from "components/SummaryStats.vue";
import { useBucketsStore } from "stores/buckets";

const bucketsStore = useBucketsStore();
const { totalActiveBalance, activeCount } = storeToRefs(bucketsStore);

const dialogOpen = ref(false);
</script>
