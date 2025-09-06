<template>
  <q-page class="bg-surface-1 q-pa-md">
    <q-card class="q-pa-md q-mb-md">
      <div class="text-subtitle1 q-mb-sm">Relay Status</div>
      <q-banner :class="bannerClass" class="text-white">
        Connected: {{ connectedCount }}/{{ totalRelays }} • {{ writableConnectedCount }} writable
        <template v-slot:action>
          <q-toggle v-model="proxyMode" label="Proxy" dense class="q-mr-sm" />
          <q-icon name="help_outline" size="16px" class="q-mr-sm">
            <q-tooltip>
              If WS fails, pause ad-blockers (uBlock/AdGuard) or try Proxy mode.
              Brave Shields can block WS on some origins.
            </q-tooltip>
          </q-icon>
          <q-btn flat label="Reconnect" @click="reconnectAll" />
          <q-btn flat label="Use vetted" @click="useVetted" />
        </template>
      </q-banner>
      <q-expansion-item label="Diagnostics" dense class="q-mt-sm">
        <q-table
          :rows="diagnostics"
          :columns="[
            { name: 'url', label: 'Relay', field: 'url' },
            { name: 'kind', label: 'Kind', field: 'kind' },
            { name: 'status', label: 'Status', field: 'status' },
            { name: 'note', label: 'Note', field: 'note' }
          ]"
          flat
          dense
          :row-key="row => row.url + row.kind"
        />
        <q-btn dense flat label="Copy Debug JSON" class="q-mt-sm" @click="copyDebug" />
      </q-expansion-item>
    </q-card>

    <q-card class="q-pa-md q-mb-md">
      <div class="text-subtitle1 q-mb-sm">Payment Profile (kind 10019)</div>
      <q-input v-model="displayName" label="Display Name" dense filled />
      <q-input v-model="pictureUrl" label="Picture URL" dense filled class="q-mt-sm" />
      <q-input v-model="p2pkPub" label="P2PK Public Key" dense filled class="q-mt-sm" />
      <q-input
        v-model="mintsText"
        type="textarea"
        label="Trusted Mints (one per line)"
        dense
        filled
        class="q-mt-sm"
      />
    </q-card>

    <q-card class="q-pa-md q-mb-md">
      <div class="row items-center justify-between">
        <div class="text-subtitle1">Tiers (kind 30019 • d="tiers")</div>
        <q-btn dense color="primary" label="Add Tier" @click="showTierDialog = true" />
      </div>

      <q-list bordered separator class="q-mt-sm">
        <q-item v-for="t in tiers" :key="t.id">
          <q-item-section>
            <div class="text-body1">
              {{ t.title }} — {{ t.price_sats }} sats ({{ t.frequency }})
            </div>
            <div class="text-caption">{{ t.description }}</div>
            <div class="text-caption" v-if="t.media?.length">
              Media: {{ t.media.join(', ') }}
            </div>
          </q-item-section>
          <q-item-section side>
            <q-btn dense flat icon="edit" @click="editTier(t)" />
            <q-btn
              dense
              flat
              icon="delete"
              color="negative"
              @click="removeTier(t.id)"
            />
          </q-item-section>
        </q-item>
      </q-list>
    </q-card>

    <q-card class="q-pa-md">
      <q-btn
        color="primary"
        :disable="publishDisabled"
        :loading="publishing"
        label="Publish Nutzap Profile"
        @click="publishAll"
      />
      <div class="text-caption q-mt-sm" v-if="lastPublishInfo">
        Published: {{ lastPublishInfo }}
      </div>
    </q-card>

    <!-- Tier dialog -->
    <q-dialog v-model="showTierDialog">
      <q-card class="q-pa-md" style="min-width: 420px">
        <q-input v-model="tierForm.title" label="Title" dense filled />
        <q-input
          v-model.number="tierForm.price_sats"
          type="number"
          label="Price (sats)"
          dense
          filled
          class="q-mt-sm"
        />
        <q-select
          v-model="tierForm.frequency"
          :options="['weekly', 'monthly']"
          label="Frequency"
          dense
          filled
          class="q-mt-sm"
        />
        <q-input
          v-model="tierForm.description"
          type="textarea"
          label="Description"
          dense
          filled
          class="q-mt-sm"
        />
        <q-input
          v-model="tierForm.mediaCsv"
          label="Media URLs (comma-separated)"
          dense
          filled
          class="q-mt-sm"
        />
        <div class="row justify-end q-gutter-sm q-mt-md">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn color="primary" label="Save" @click="saveTier" v-close-popup />
        </div>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script lang="ts" setup>
import { useNutzapProfile } from 'src/composables/useNutzapProfile'

const {
  // state
  displayName,
  pictureUrl,
  p2pkPub,
  mintsText,
  tiers,
  tierForm,
  showTierDialog,
  publishing,
  lastPublishInfo,
  diagnostics,
  proxyMode,
  // derived
  connectedCount,
  writableConnectedCount,
  totalRelays,
  publishDisabled,
  bannerClass,
  // actions
  editTier,
  removeTier,
  saveTier,
  publishAll,
  reconnectAll,
  useVetted,
  copyDebug,
} = useNutzapProfile()
</script>
