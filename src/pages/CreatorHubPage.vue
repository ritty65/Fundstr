<template>
  <q-page class="bg-surface-1 q-pa-md">
    <NostrRelayErrorBanner :error="publishErrors" @retry="publishProfileBundle" />
    <q-card class="q-pa-lg bg-surface-2 shadow-4 full-width">
      <q-banner v-if="!ndkConnected" class="text-white bg-orange">
        <template #avatar><q-spinner /></template>
        Connecting to your Nostr relays ({{ connectedCount }} / {{ totalRelays }})...
        <template #action>
          <q-btn flat label="Reconnect" @click="reconnectAll" />
        </template>
      </q-banner>
      <q-banner v-else class="text-white bg-positive">
        Connected to {{ connectedCount }} of {{ totalRelays }} relays. Ready to publish.
      </q-banner>
      <q-banner v-if="failedRelays.length" class="text-white bg-negative">
        <div>
          Failed relays:
          <ul class="q-pl-md">
            <li
              v-for="r in failedRelays"
              :key="r"
              style="word-break: break-all"
            >
              {{ r }}
            </li>
          </ul>
        </div>
        <template #action>
          <q-btn flat label="Check Settings" @click="goToSettings" />
        </template>
      </q-banner>
      <div class="row items-center justify-between q-mb-lg">
        <div class="text-h5">Creator Hub</div>
        <div class="row items-center q-gutter-sm">
          <ThemeToggle />
          <q-btn
            flat
            color="primary"
            label="Find & Test Relays"
            @click="showRelayScanner = true"
          />
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
      <PublishBar
        v-if="isDirty"
        :publishing="publishing"
        @publish="publishProfileBundle"
      />
      <RelayScannerDialog
        v-model="showRelayScanner"
        @relays-selected="onRelaysSelected"
      />
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
import PublishBar from "components/PublishBar.vue";
import NostrRelayErrorBanner from "components/NostrRelayErrorBanner.vue";
import RelayScannerDialog from "components/RelayScannerDialog.vue";
import { useCreatorProfileStore } from "stores/creatorProfile";

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
  publishing,
  publishErrors,
  isDirty,
  profileRelays,
  connectedCount,
  totalRelays,
  failedRelays,
  reconnectAll,
  publishProfileBundle,
} = useCreatorHub();

const profileStore = useCreatorProfileStore();
const showRelayScanner = ref(false);
const ndkConnected = computed(() => connectedCount.value > 0);

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

function goToSettings() {
  router.push("/settings");
}
</script>

<style lang="scss" src="../css/creator-hub.scss" scoped></style>
