<template>
  <q-page class="bg-surface-1 q-pa-md">
    <NostrRelayErrorBanner
      :error="publishErrors"
      :allow-replace="true"
      @retry="publishProfileBundle"
      @manage="openRelayManager"
      @replace="replaceWithVettedRelays"
    />
    <q-card class="q-pa-lg bg-surface-2 shadow-4 full-width">
      <div
        class="creator-status-header q-mb-lg"
        :class="`creator-status-header--${statusVariant}`"
      >
        <div class="creator-status-header__summary">
          <div class="creator-status-header__title">
            <q-icon :name="connectionIcon" :color="connectionIconColor" size="md" />
            <div class="text-h6 text-1">
              {{ connectionSummary }}
            </div>
          </div>
          <div
            v-if="connectionSubtitle"
            class="creator-status-header__subtitle text-caption text-2"
          >
            {{ connectionSubtitle }}
          </div>
          <div class="creator-status-header__chips">
            <q-chip
              dense
              class="status-chip"
              :class="`status-chip--${fundstrChipVariant}`"
              icon="hub"
            >
              Fundstr relay: {{ fundstrRelayStatusLabel }}
            </q-chip>
            <q-chip
              dense
              class="status-chip"
              :class="`status-chip--${failureChipVariant}`"
              :icon="hasFailures ? 'warning' : 'check_circle'"
            >
              {{ failureChipLabel }}
            </q-chip>
          </div>
          <div v-if="hasFailures" class="creator-status-header__failure-list">
            <div class="text-caption text-negative q-mb-xs">Failed relays</div>
            <ul class="creator-status-header__failure-items">
              <li v-for="r in failedRelays" :key="r">{{ r }}</li>
            </ul>
          </div>
        </div>
        <div class="creator-status-header__actions">
          <q-btn
            v-if="showReconnect"
            flat
            dense
            color="primary"
            label="Reconnect"
            @click="reconnectAll"
          />
          <q-btn
            v-if="hasFailures"
            flat
            dense
            color="negative"
            label="Check Settings"
            @click="goToSettings"
          />
          <q-btn
            flat
            dense
            color="primary"
            label="Find & Test Relays"
            @click="showRelayScanner = true"
          />
        </div>
      </div>
      <div class="row items-center justify-between q-mb-lg">
        <div class="text-h5">Creator Hub</div>
        <div class="row items-center q-gutter-sm">
          <SaveStatusIndicator :status="saveStatus" :error-message="saveError || undefined" />
          <q-btn
            color="primary"
            unelevated
            dense
            label="Publish changes"
            :disable="!isDirty || isSaving"
            :loading="isSaving"
            @click="publishProfileBundle"
          />
          <ThemeToggle />
        </div>
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
        <div class="q-mb-md">
          <div class="text-subtitle1 q-mb-sm">Relays</div>
          <q-list bordered>
            <q-item v-for="url in profileRelays" :key="url">
              <q-item-section avatar>
                <q-icon
                  :name="failedRelays.includes(url) ? 'cloud_off' : 'cloud_done'"
                  :color="failedRelays.includes(url) ? 'negative' : 'positive'"
                />
              </q-item-section>
              <q-item-section>{{ url }}</q-item-section>
              <q-item-section side>
                <q-btn
                  flat
                  round
                  dense
                  icon="close"
                  @click="removeRelay(url)"
                />
              </q-item-section>
            </q-item>
          </q-list>
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
      <RelayScannerDialog
        v-model="showRelayScanner"
        @relays-selected="onRelaysSelected"
      />
      <RelayManagerDialog ref="relayManagerDialogRef" />
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import Draggable from "vuedraggable";

import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useCreatorHub } from "src/composables/useCreatorHub";
import { useClipboard } from "src/composables/useClipboard";
import { buildProfileUrl } from "src/utils/profileUrl";
import CreatorProfileForm from "components/CreatorProfileForm.vue";
import TierItem from "components/TierItem.vue";
import AddTierDialog from "components/AddTierDialog.vue";
import DeleteModal from "components/DeleteModal.vue";
import ThemeToggle from "components/ThemeToggle.vue";
import SaveStatusIndicator from "components/SaveStatusIndicator.vue";
import NostrRelayErrorBanner from "components/NostrRelayErrorBanner.vue";
import RelayScannerDialog from "components/RelayScannerDialog.vue";
import RelayManagerDialog from "components/RelayManagerDialog.vue";
import { useCreatorProfileStore } from "stores/creatorProfile";
import { useNow } from "@vueuse/core";

const {
  profile,
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
  addTier,
  editTier,
  confirmDelete,
  updateOrder,
  refreshTiers,
  performDelete,
  publishErrors,
  isDirty,
  isSaving,
  saveError,
  lastSaveSuccessTimestamp,
  profileRelays,
  connectedCount,
  totalRelays,
  failedRelays,
  reconnectAll,
  publishProfileBundle,
  replaceWithVettedRelays,
  fundstrRelayStatus,
} = useCreatorHub();

const profileStore = useCreatorProfileStore();
const showRelayScanner = ref(false);
const relayManagerDialogRef = ref<InstanceType<typeof RelayManagerDialog> | null>(null);
function openRelayManager() {
  relayManagerDialogRef.value?.show();
}

function onRelaysSelected(urls: string[]) {
  profileRelays.value = urls.slice(0, 8);
}

function removeRelay(url: string) {
  profileRelays.value = profileRelays.value.filter((r) => r !== url);
}

const nsec = ref("");

const router = useRouter();
const { copy } = useClipboard();
const profileUrl = computed(() => buildProfileUrl(npub.value, router));

type SaveIndicatorStatus = "idle" | "unsaved" | "saving" | "success" | "error";

const nowRef = useNow({ interval: 1000 });

const saveStatus = computed<SaveIndicatorStatus>(() => {
  if (isSaving.value) {
    return "saving";
  }
  if (saveError.value) {
    return "error";
  }
  const currentTime =
    nowRef.value instanceof Date ? nowRef.value.getTime() : nowRef.value;
  if (
    lastSaveSuccessTimestamp.value &&
    currentTime - lastSaveSuccessTimestamp.value < 5000
  ) {
    return "success";
  }
  if (isDirty.value) {
    return "unsaved";
  }
  return "idle";
});

const fundstrRelayStatusLabel = computed(() => {
  switch (fundstrRelayStatus.value) {
    case "connected":
      return "Connected";
    case "disconnected":
      return "Disconnected";
    case "reconnecting":
      return "Reconnecting…";
    default:
      return "Connecting…";
  }
});

const hasFailures = computed(() => failedRelays.value.length > 0);

const connectionStateVariant = computed(() => {
  if (totalRelays.value === 0) {
    return "neutral";
  }
  if (connectedCount.value === 0) {
    return "negative";
  }
  if (connectedCount.value < totalRelays.value) {
    return "warning";
  }
  return "positive";
});

const statusVariant = computed(() => {
  if (hasFailures.value || connectionStateVariant.value === "negative") {
    return "alert";
  }
  if (connectionStateVariant.value === "positive") {
    return "success";
  }
  return "neutral";
});

const connectionIcon = computed(() => {
  switch (connectionStateVariant.value) {
    case "positive":
      return "cloud_done";
    case "warning":
      return "cloud_queue";
    case "negative":
      return "cloud_off";
    default:
      return "cloud";
  }
});

const connectionIconColor = computed(() => {
  switch (connectionStateVariant.value) {
    case "positive":
      return "positive";
    case "warning":
      return "warning";
    case "negative":
      return "negative";
    default:
      return "primary";
  }
});

const connectionSummary = computed(() => {
  if (totalRelays.value === 0) {
    return "No relays configured yet";
  }
  return `Connected to ${connectedCount.value} of ${totalRelays.value} relays`;
});

const connectionSubtitle = computed(() => {
  if (totalRelays.value === 0) {
    return "Add relays to start publishing to your network.";
  }
  if (connectedCount.value === 0) {
    return "Publishing will still try vetted relays.";
  }
  if (connectedCount.value < totalRelays.value) {
    return "Some relays are still reconnecting.";
  }
  return "";
});

const fundstrChipVariant = computed(() => {
  switch (fundstrRelayStatus.value) {
    case "connected":
      return "positive";
    case "disconnected":
      return "negative";
    case "reconnecting":
      return "warning";
    default:
      return "neutral";
  }
});

const failureChipVariant = computed(() => (hasFailures.value ? "negative" : "positive"));

const failureChipLabel = computed(() => {
  if (!hasFailures.value) {
    return "No relay failures";
  }
  const count = failedRelays.value.length;
  return count === 1 ? "1 relay failed" : `${count} relays failed`;
});

const showReconnect = computed(
  () => totalRelays.value > 0 && connectedCount.value < totalRelays.value
);

function goToSettings() {
  router.push("/settings");
}
</script>

<style lang="scss" src="../css/creator-hub.scss" scoped></style>
