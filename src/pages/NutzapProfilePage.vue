<template>
  <q-page class="bg-surface-1 q-pa-md q-gutter-md column">
    <div class="row items-center q-gutter-sm">
      <RelayStatusIndicator />
      <div class="text-caption text-2">Isolated relay: relay.fundstr.me (WS → HTTP fallback)</div>
    </div>

    <q-card class="q-pa-md">
      <div class="text-subtitle1 q-mb-sm">Payment Profile (kind 10019)</div>
      <q-input v-model="displayName" label="Display Name" dense filled class="q-mb-sm" />
      <q-input v-model="pictureUrl" label="Picture URL" dense filled class="q-mb-sm" />
      <q-input v-model="p2pkPub" label="P2PK Public Key" dense filled class="q-mb-sm" />
      <q-input
        v-model="mintsText"
        type="textarea"
        label="Trusted Mints (one per line)"
        dense
        filled
        autogrow
      />
    </q-card>

    <q-card class="q-pa-md">
      <div class="row items-center justify-between q-mb-sm">
        <div class="text-subtitle1">Tiers ({{ tiers.length }}) — kind {{ tierKindLabel }}</div>
        <q-btn dense color="primary" label="Add Tier" @click="openNewTier" />
      </div>
      <div class="text-caption text-2 q-mb-sm">
        Each tier is published as parameterized replaceable event ["d","tiers"] on relay.fundstr.me.
      </div>
      <q-list bordered separator v-if="tiers.length">
        <q-item v-for="tier in tiers" :key="tier.id">
          <q-item-section>
            <div class="text-body1">
              {{ tier.title }} — {{ tier.price }} sats ({{ frequencyLabel(tier.frequency) }})
            </div>
            <div class="text-caption" v-if="tier.description">{{ tier.description }}</div>
            <div class="text-caption" v-if="tier.media?.length">
              Media:
              {{ tier.media.map(m => m.url).join(', ') }}
            </div>
          </q-item-section>
          <q-item-section side>
            <q-btn dense flat icon="edit" @click="editTier(tier)" />
            <q-btn dense flat icon="delete" color="negative" @click="removeTier(tier.id)" />
          </q-item-section>
        </q-item>
      </q-list>
      <div v-else class="text-caption text-2">No tiers yet. Add at least one tier before publishing.</div>
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
        Last publish: {{ lastPublishInfo }}
      </div>
    </q-card>

    <q-dialog v-model="showTierDialog" @hide="resetTierForm">
      <q-card class="q-pa-md" style="min-width: 420px">
        <div class="text-subtitle1 q-mb-sm">{{ tierForm.id ? 'Edit Tier' : 'Add Tier' }}</div>
        <q-input v-model="tierForm.title" label="Title" dense filled class="q-mb-sm" />
        <q-input
          v-model.number="tierForm.price"
          type="number"
          label="Price (sats)"
          dense
          filled
          class="q-mb-sm"
        />
        <q-select
          v-model="tierForm.frequency"
          :options="tierFrequencyOptions"
          option-label="label"
          option-value="value"
          emit-value
          map-options
          label="Frequency"
          dense
          filled
          class="q-mb-sm"
        />
        <q-input
          v-model="tierForm.description"
          type="textarea"
          label="Description"
          dense
          filled
          autogrow
          class="q-mb-sm"
        />
        <q-input
          v-model="tierForm.mediaCsv"
          label="Media URLs (comma-separated)"
          dense
          filled
        />
        <div class="row justify-end q-gutter-sm q-mt-md">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn color="primary" label="Save" @click="saveTier" v-close-popup />
        </div>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import RelayStatusIndicator from 'src/nutzap/RelayStatusIndicator.vue';
import { computed } from 'vue';
import { useNutzapProfile } from 'src/nutzap/useNutzapProfile';
import { NUTZAP_TIERS_KIND } from 'src/nutzap/relayConfig';

const {
  displayName,
  pictureUrl,
  p2pkPub,
  mintsText,
  tiers,
  tierForm,
  showTierDialog,
  publishing,
  lastPublishInfo,
  publishDisabled,
  tierFrequencies,
  editTier,
  removeTier,
  saveTier,
  resetTierForm,
  publishAll,
} = useNutzapProfile();

const tierKindLabel = computed(() => NUTZAP_TIERS_KIND);

const tierFrequencyOptions = computed(() =>
  tierFrequencies.map(value => ({
    value,
    label:
      value === 'one_time'
        ? 'One-time'
        : value === 'monthly'
          ? 'Monthly'
          : 'Yearly',
  }))
);

function openNewTier() {
  resetTierForm();
  showTierDialog.value = true;
}

function frequencyLabel(value: (typeof tierFrequencies)[number]) {
  return value === 'one_time' ? 'one-time' : value;
}
</script>
