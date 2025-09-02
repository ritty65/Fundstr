<template>
  <q-page class="bg-surface-1 q-pa-md">
    <q-card class="q-pa-lg bg-surface-2 shadow-4 full-width">
      <NostrRelayErrorBanner />
      <q-banner
        v-if="!nostr.connected"
        dense
        class="bg-grey-3 q-mb-sm"
      >
        <div class="row items-center q-gutter-sm">
          <span>Offline - {{ connectedCount }}/{{ totalRelays }} connected</span>
          <q-btn flat dense label="Reconnect" @click="nostr.connect" />
        </div>
      </q-banner>
      <q-banner
        v-if="failedRelays.length"
        dense
        class="bg-red-2 q-mb-sm"
      >
        <div v-for="url in failedRelays" :key="url">
          Relay {{ url }} unreachable
        </div>
      </q-banner>
      <q-banner
        v-if="publishRetryPending"
        dense
        class="bg-orange-2 q-mb-sm"
      >
        <div class="row items-center no-wrap">
          <span>Tier changes queued - will publish when connected.</span>
          <q-space />
          <q-btn flat dense label="Retry Now" @click="retryPublishNow" />
        </div>
      </q-banner>
      <div class="row items-center justify-between q-mb-lg">
        <div class="text-h5">Creator Hub</div>
        <ThemeToggle />
      </div>
      <div v-if="!loggedIn" class="q-mt-lg q-mb-lg">
        <q-btn color="primary" class="full-width q-mb-md" @click="() => login()"
          >Login with Browser Signer</q-btn
        >
        <q-input
          v-model="nsec"
          type="password"
          label="nsec"
          outlined
          dense
          class="q-mb-sm"
        />
        <div class="text-negative text-caption q-mb-sm">
          Keep your nsec secret – it never leaves your browser.
        </div>
        <q-btn color="primary" outline class="full-width" @click="() => login(nsec)"
          >Login with nsec</q-btn
        >
      </div>
      <div v-else>
        <div class="text-center q-mb-md">
          Logged in as <span class="text-primary">{{ npub }}</span>
          <q-btn
            flat
            dense
            color="primary"
            class="q-ml-sm"
            to="/creator-subscribers"
          >
            Subscribers
          </q-btn>
          <q-btn flat dense color="primary" class="q-ml-sm" @click="logout"
            >Logout</q-btn
          >
        </div>
        <div class="q-mb-md">
          <div class="text-subtitle1 q-mb-sm">Share your profile</div>
          <q-input :model-value="profileUrl" readonly dense>
            <template #append>
              <q-btn flat icon="content_copy" @click="copy(profileUrl)" />
            </template>
          </q-input>
        </div>
        <q-splitter v-if="!isMobile" v-model="splitterModel">
          <template #before>
            <q-card class="section-card">
              <CreatorProfileForm />
            </q-card>
          </template>
          <template #after>
            <q-card class="section-card">
              <div>
                <div class="text-h6 q-mb-md">Subscription Tiers</div>
                <Draggable
                  v-model="draggableTiers"
                  item-key="id"
                  handle=".drag-handle"
                  ghost-class="drag-ghost"
                  animation="200"
                  swap-threshold="0.65"
                  @end="updateOrder"
                >
                  <template #item="{ element }">
                    <div class="q-mb-md">
                      <TierItem
                        :tier-data="element"
                        @edit="editTier(element.id)"
                        @delete="confirmDelete(element.id)"
                      />
                    </div>
                  </template>
                </Draggable>
                <div class="text-center q-mt-md">
                  <q-btn color="primary" flat @click="addTier">Add Tier</q-btn>
                </div>
              </div>
            </q-card>
          </template>
        </q-splitter>
        <div v-else>
          <q-tabs v-model="tab" no-caps align="justify" class="q-mb-md">
            <q-tab name="profile" label="Profile" />
            <q-tab name="tiers" label="Subscription Tiers" />
          </q-tabs>
          <q-tab-panels v-model="tab" animated>
            <q-tab-panel name="profile">
              <q-card class="section-card">
                <CreatorProfileForm />
              </q-card>
            </q-tab-panel>
            <q-tab-panel name="tiers">
              <q-card class="section-card">
                <div>
                  <div class="text-h6 q-mb-md">Subscription Tiers</div>
                  <Draggable
                    v-model="draggableTiers"
                    item-key="id"
                    handle=".drag-handle"
                    ghost-class="drag-ghost"
                    animation="200"
                    swap-threshold="0.65"
                    @end="updateOrder"
                  >
                    <template #item="{ element }">
                      <div class="q-mb-md">
                        <TierItem
                          :tier-data="element"
                          @edit="editTier(element.id)"
                          @delete="confirmDelete(element.id)"
                        />
                      </div>
                    </template>
                  </Draggable>
                  <div class="text-center q-mt-md">
                    <q-btn color="primary" flat @click="addTier"
                      >Add Tier</q-btn
                    >
                  </div>
                </div>
              </q-card>
            </q-tab-panel>
          </q-tab-panels>
        </div>
        <DeleteModal v-model="deleteDialog" @confirm="performDelete" />
        <AddTierDialog
          v-model="showTierDialog"
          :tier="currentTier"
          @save="refreshTiers"
        />
      </div>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import Draggable from "vuedraggable";

import { computed, ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useCreatorHub } from "src/composables/useCreatorHub";
import { useClipboard } from "src/composables/useClipboard";
import { buildProfileUrl } from "src/utils/profileUrl";
import CreatorProfileForm from "components/CreatorProfileForm.vue";
import TierItem from "components/TierItem.vue";
import AddTierDialog from "components/AddTierDialog.vue";
import DeleteModal from "components/DeleteModal.vue";
import ThemeToggle from "components/ThemeToggle.vue";
import NostrRelayErrorBanner from "components/NostrRelayErrorBanner.vue";
import { useNostrStore } from "src/stores/nostr";
import { useNdk } from "src/composables/useNdk";
import type NDK from "@nostr-dev-kit/ndk";

const {
  isMobile,
  splitterModel,
  tab,
  loggedIn,
  draggableTiers,
  deleteDialog,
  deleteId,
  showTierDialog,
  currentTier,
  npub,
  login,
  logout,
  publishFullProfile,
  addTier,
  editTier,
  confirmDelete,
  updateOrder,
  refreshTiers,
  performDelete,
  publishRetryPending,
  retryPublishNow,
} = useCreatorHub();

const nsec = ref("");

const router = useRouter();
const { copy } = useClipboard();
const profileUrl = computed(() => buildProfileUrl(npub.value, router));

const nostr = useNostrStore();
const ndkRef = ref<NDK | null>(null);
onMounted(async () => {
  ndkRef.value = await useNdk();
});

const connectedCount = computed(() => {
  if (!ndkRef.value) return 0;
  return Array.from(ndkRef.value.pool.relays.values()).filter(
    (r) => r.connected,
  ).length;
});
const totalRelays = computed(() => ndkRef.value?.pool.relays.size || 0);
const failedRelays = computed(() => nostr.failedRelays);
</script>

<style lang="scss" src="../css/creator-hub.scss" scoped></style>
