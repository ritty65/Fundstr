<template>
  <div class="container">
    <CreatorProfileModal
      :show="showProfileModal"
      :pubkey="selectedProfilePubkey"
      @close="showProfileModal = false"
    />
    <DonateDialog v-model="showDonateDialog" @confirm="handleDonate" />
    <SendTokenDialog />
    <div class="search-container">
      <h1 class="section-title">Nostr User Search</h1>
      <p class="text-sm text-center text-gray-600 mb-6">
        Search by name, npub, or NIP-05 identifier (e.g., user@domain.com).
      </p>
      <div class="search-input-wrapper">
        <input
          type="text"
          id="searchInput"
          class="search-input"
          placeholder="Search Nostr profiles..."
          v-model="searchQuery"
          @input="debouncedSearch"
        />
        <button @click="handleSearch(true)" class="action-button refresh-button" :disabled="searching">
          Refresh
        </button>
      </div>
      <div id="loader" class="loader" v-if="searching"></div>
      <ul id="resultsList" class="results-list">
        <li v-for="profile in searchResults" :key="profile.pubkey" class="result-item">
          <CreatorCard
            :profile="profile"
            @view-tiers="viewProfile"
            @message="startChat"
            @donate="donate"
          />
        </li>
      </ul>
      <p id="statusMessage" class="status-message" v-if="statusMessage">{{ statusMessage }}</p>
      <button id="retryButton" class="retry-button" v-if="showRetry" @click="retrySearch">Retry</button>
    </div>

    <div class="featured-creators-container">
      <div class="flex justify-between items-center">
        <h2 class="section-title">Featured Creators</h2>
        <button @click="refreshFeatured" class="action-button view-button" :disabled="loadingFeatured">
          Refresh
        </button>
      </div>
      <div id="featuredCreatorsLoader" class="loader" v-if="loadingFeatured && !featuredCreators.length"></div>
      <div id="featuredCreatorsGrid" class="featured-creators-grid">
        <CreatorCard
          v-for="profile in creatorsStore.featuredCreators"
          :key="profile.pubkey"
          :profile="profile"
          @view-tiers="viewProfile"
          @message="startChat"
          @donate="donate"
        />
      </div>
      <p id="featuredStatusMessage" class="status-message" v-if="featuredStatusMessage">{{ featuredStatusMessage }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useCreatorsStore } from 'stores/creators';
import { nip19 } from 'nostr-tools';
import { useRouter } from 'vue-router';
import { useMessengerStore } from 'stores/messenger';
import { useSendTokensStore } from 'stores/sendTokensStore';
import { useNostrStore } from 'stores/nostr';
import DonateDialog from "components/DonateDialog.vue";
import SendTokenDialog from "components/SendTokenDialog.vue";
import { useDonationPresetsStore } from "stores/donationPresets";
import CreatorProfileModal from 'components/CreatorProfileModal.vue';
import CreatorCard from 'components/CreatorCard.vue';

const creatorsStore = useCreatorsStore();
const searchQuery = ref('');
const searchResults = ref([]);
const statusMessage = ref('');
const showRetry = ref(false);

const searching = computed(() => creatorsStore.searching);
const loadingFeatured = computed(() => creatorsStore.loadingFeatured);
const featuredStatusMessage = computed(() => {
  if (creatorsStore.error) return creatorsStore.error;
  if (loadingFeatured.value && !creatorsStore.featuredCreators.length) return 'Loading creators...';
  if (!loadingFeatured.value && !creatorsStore.featuredCreators.length && !creatorsStore.error) return 'Could not load creators. Please try again.';
  return '';
});

const debouncedSearch = debounce((...args) => handleSearch(false, ...args), 300);

function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

async function handleSearch(forceRefresh = false) {
  const query = searchQuery.value.trim();
  if (!query) {
    searchResults.value = [];
    return;
  }
  creatorsStore.searching = true;
  statusMessage.value = '';
  showRetry.value = false;

  try {
    await creatorsStore.searchCreators(query, forceRefresh);
    searchResults.value = creatorsStore.searchResults.map(profile => ({
      ...profile,
      npub: nip19.npubEncode(profile.pubkey),
      npubShort: `${nip19.npubEncode(profile.pubkey).substring(0, 10)}...${nip19.npubEncode(profile.pubkey).substring(nip19.npubEncode(profile.pubkey).length - 5)}`
    }));
  } catch (error) {
    console.error('Search failed:', error);
    statusMessage.value = 'Search failed. Please try again.';
    showRetry.value = true;
  } finally {
    creatorsStore.searching = false;
  }
}

function retrySearch() {
  handleSearch(true);
}

async function loadFeatured() {
  await creatorsStore.loadFeaturedCreators();
}

async function refreshFeatured() {
  await creatorsStore.loadFeaturedCreators(true);
}

const router = useRouter();
const messenger = useMessengerStore();
const sendTokensStore = useSendTokensStore();
const nostr = useNostrStore();
const showDonateDialog = ref(false);
const selectedPubkey = ref("");
const donationStore = useDonationPresetsStore();
const showProfileModal = ref(false);
const selectedProfilePubkey = ref('');

function viewProfile(pubkey: string) {
  selectedProfilePubkey.value = pubkey;
  showProfileModal.value = true;
}

function startChat(pubkey: string) {
  const resolvedPubkey = nostr.resolvePubkey(pubkey);
  const url = router.resolve({ path: "/nostr-messenger", query: { pubkey: resolvedPubkey } }).href;
  window.open(url, '_blank');
}

function donate(pubkey: string) {
  const url = router.resolve({ name: 'PublicCreatorProfile', params: { npubOrHex: pubkey } }).href;
  window.open(url, '_blank');
}

function handleDonate({
  bucketId,
  locked,
  type,
  amount,
  periods,
  message,
}: any) {
  if (!selectedPubkey.value) return;
  if (type === "one-time") {
    sendTokensStore.clearSendData();
    sendTokensStore.recipientPubkey = selectedPubkey.value;
    sendTokensStore.sendViaNostr = true;
    sendTokensStore.sendData.bucketId = bucketId;
    sendTokensStore.sendData.amount = amount;
    sendTokensStore.sendData.memo = message;
    sendTokensStore.sendData.p2pkPubkey = locked ? selectedPubkey.value : "";
    sendTokensStore.showLockInput = locked;
    showDonateDialog.value = false;
    sendTokensStore.showSendTokens = true;
  } else {
    donationStore.createDonationPreset(
      periods,
      amount,
      selectedPubkey.value,
      bucketId,
    );
    showDonateDialog.value = false;
  }
}


onMounted(() => {
  loadFeatured();
});

</script>

<style scoped>
body {
  font-family: "Inter", sans-serif;
  background-color: #f7fafc; /* Tailwind gray-100 */
  color: #2d3748; /* Tailwind gray-800 */
}
.container {
  width: 100%;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(2rem, 4vw, 3rem);
  padding: clamp(1.5rem, 4vw, 3rem) clamp(1rem, 4vw, 2.5rem);
  box-sizing: border-box;
}
.search-container,
.featured-creators-container {
  width: min(100%, clamp(320px, 85vw, 1100px));
  margin: 0 auto;
  padding: clamp(1.5rem, 4vw, 2.5rem);
  background-color: white;
  border-radius: 1rem; /* Tailwind rounded-2xl */
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1),
    0 4px 6px -2px rgba(0, 0, 0, 0.05); /* Tailwind shadow-lg */
  transition: background-color 0.3s ease;
}
.search-input-wrapper {
  display: flex;
  gap: 0.5rem;
}
.search-input {
  flex-grow: 1;
  padding: 0.875rem 1.25rem; /* Increased padding */
  border: 1px solid #e2e8f0; /* Tailwind gray-300 */
  border-radius: 0.5rem; /* Tailwind rounded-lg */
  font-size: 1rem;
  transition: border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
  color: #2d3748; /* Tailwind gray-800 */
}
.search-input:focus {
  outline: none;
  border-color: #4299e1; /* Tailwind blue-500 */
  box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.5); /* Tailwind ring-blue-500 ring-opacity-50 */
}
.refresh-button {
  background-color: #667eea;
}
.refresh-button:hover {
  background-color: #5a67d8;
}
.results-list,
.featured-creators-grid {
  margin-top: 1.5rem;
  list-style: none;
  padding: 0;
}
.featured-creators-grid {
  display: grid;
  grid-template-columns: repeat(
    auto-fill,
    minmax(280px, 1fr)
  ); /* Responsive grid */
  gap: 1.5rem;
}
.result-item {
  list-style: none;
  margin-bottom: 1rem;
}

.action-button {
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
  border-radius: 0.375rem;
  color: white;
  transition: background-color 0.2s;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}
.view-button {
  background-color: #a0aec0;
}
.view-button:hover {
  background-color: #718096;
}
.status-message {
  text-align: center;
  color: #718096;
  padding: 1.5rem;
  font-style: italic;
}
.retry-button {
  margin: 0 auto;
  margin-top: -1rem;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: white;
  background-color: #4299e1;
  border-radius: 0.375rem;
  transition: background-color 0.2s;
  display: block;
}
.retry-button:hover {
  background-color: #3182ce;
}
.loader {
  display: block;
  margin: 1.5rem auto;
  border: 4px solid #e2e8f0;
  border-top: 4px solid #4299e1;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
.section-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #2d3748;
  margin-bottom: 1.5rem;
  text-align: center;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid #e2e8f0;
}
body.dark .section-title {
  color: #e2e8f0;
  border-bottom-color: #4a5568;
}
body.dark {
  background-color: #1a202c;
  color: #e2e8f0;
}
body.dark .search-container,
body.dark .featured-creators-container {
  background-color: #1a202c; /* Tailwind gray-900 */
  border: 1px solid #4a5568; /* Tailwind gray-700 */
}
body.dark .search-input {
  background-color: #2d3748; /* Tailwind gray-800 */
  border-color: #4a5568;
  color: #e2e8f0;
}
body.dark .result-item {
  /* The creator card now handles its own background color */
  background-color: transparent;
  border-color: transparent;
}
</style>