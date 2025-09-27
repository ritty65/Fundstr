<template>
  <q-page class="nutzap-diagnostics-page bg-surface-1 q-pa-lg">
    <div class="page-header q-mb-lg">
      <div class="text-h5 text-1">Advanced diagnostics</div>
      <div class="text-body2 text-2">
        Deep-dive tools for isolating Nutzap relay issues and validating browser capabilities.
      </div>
    </div>

    <div class="diagnostic-grid">
      <q-card class="diagnostic-card">
        <q-card-section class="q-gutter-xs">
          <div class="text-h6">Legacy Explorer</div>
          <div class="text-caption text-2">
            Issue single-relay REQ subscriptions and inspect EOSE vs timeout behaviour.
          </div>
        </q-card-section>
        <q-separator />
        <q-card-section>
          <NutzapLegacyExplorer />
        </q-card-section>
      </q-card>

      <q-card class="diagnostic-card">
        <q-card-section class="q-gutter-xs">
          <div class="text-h6">Client Self-tests</div>
          <div class="text-caption text-2">
            Verify browser capabilities required for Nutzap authoring without hitting the network.
          </div>
        </q-card-section>
        <q-separator />
        <q-card-section>
          <NutzapSelfTests />
        </q-card-section>
      </q-card>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import NutzapLegacyExplorer from 'src/nutzap/onepage/NutzapLegacyExplorer.vue';
import NutzapSelfTests from 'src/nutzap/onepage/NutzapSelfTests.vue';
</script>

<style scoped>
.nutzap-diagnostics-page {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.page-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.diagnostic-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}

.diagnostic-card {
  height: 100%;
}
</style>
