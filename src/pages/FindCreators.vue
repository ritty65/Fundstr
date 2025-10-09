<template>
  <div class="container">
    <DonateDialog v-model="showDonateDialog" @confirm="handleDonate" />
    <SendTokenDialog />
    <div class="search-container">
      <h1 class="section-title">Nostr User Search</h1>
      <p class="text-sm text-center text-gray-600 mb-6">
        Search by name, npub, or NIP-05 identifier (e.g., user@domain.com).
      </p>
      <input
        type="text"
        id="searchInput"
        class="search-input"
        placeholder="Search Nostr profiles..."
        v-model="searchQuery"
        @input="debouncedSearch"
      />
      <div id="loader" class="loader" v-if="searching"></div>
      <ul id="resultsList" class="results-list">
        <li v-for="profile in searchResults" :key="profile.pubkey" class="result-item group">
          <div class="profile-header">
            <img class="avatar" :src="profile.picture || `https://placehold.co/50x50/A0AEC0/FFFFFF?text=${(profile.name || 'N')[0]?.toUpperCase()}`" :alt="profile.name || 'Nostr User'">
            <div class="info">
              <h3>{{ profile.name || (profile.nip05 ? profile.nip05.split('@')[0] : 'Unnamed User') }}</h3>
              <p>
                <strong>Npub:</strong> {{ profile.npubShort }}
                <button class="copy-button" @click.stop="copyToClipboard(profile.npub, $event.target)">Copy</button>
              </p>
              <p v-if="profile.nip05"><strong>NIP-05:</strong> <span class="nip05">{{ profile.nip05 }}</span></p>
              <p v-if="profile.about"><em>{{ profile.about.substring(0, 150) }}{{ profile.about.length > 150 ? '...' : '' }}</em></p>
              <p v-if="profile.lud16"><strong>LN:</strong> {{ profile.lud16 }}</p>
            </div>
          </div>
          <div class="creator-actions">
            <button class="action-button view-button" @click.stop="viewProfile(profile.pubkey)">View Subscription Tiers</button>
            <button class="action-button message-button" @click.stop="startChat(profile.pubkey)">Message</button>
            <button class="action-button donate-button" @click.stop="donate(profile.pubkey)">Donate</button>
          </div>
        </li>
      </ul>
      <p id="statusMessage" class="status-message" v-if="statusMessage">{{ statusMessage }}</p>
      <button id="retryButton" class="retry-button" v-if="showRetry" @click="retrySearch">Retry</button>
    </div>

    <div class="featured-creators-container">
      <h2 class="section-title">Featured Creators</h2>
      <div id="featuredCreatorsLoader" class="loader" v-if="loadingFeatured"></div>
      <div id="featuredCreatorsGrid" class="featured-creators-grid">
        <div v-for="profile in featuredCreators" :key="profile.pubkey" class="creator-card group">
          <div class="profile-header">
            <img class="avatar" :src="profile.picture || `https://placehold.co/50x50/A0AEC0/FFFFFF?text=${(profile.name || 'N')[0]?.toUpperCase()}`" :alt="profile.name || 'Nostr User'">
            <div class="info">
              <h3>{{ profile.name || (profile.nip05 ? profile.nip05.split('@')[0] : 'Unnamed User') }}</h3>
              <p>
                <strong>Npub:</strong> {{ profile.npubShort }}
                <button class="copy-button" @click.stop="copyToClipboard(profile.npub, $event.target)">Copy</button>
              </p>
              <p v-if="profile.nip05"><strong>NIP-05:</strong> <span class="nip05">{{ profile.nip05 }}</span></p>
              <p v-if="profile.about"><em>{{ profile.about.substring(0, 80) }}{{ profile.about.length > 80 ? '...' : '' }}</em></p>
            </div>
          </div>
          <div class="creator-actions">
            <button class="action-button view-button" @click.stop="viewProfile(profile.pubkey)">View Subscription Tiers</button>
            <button class="action-button message-button" @click.stop="startChat(profile.pubkey)">Message</button>
            <button class="action-button donate-button" @click.stop="donate(profile.pubkey)">Donate</button>
          </div>
        </div>
      </div>
      <p id="featuredStatusMessage" class="status-message" v-if="featuredStatusMessage">{{ featuredStatusMessage }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useCreatorsStore, FEATURED_CREATORS } from 'stores/creators';
import { creatorCacheService } from 'src/nutzap/creatorCache';
import { nip19 } from 'nostr-tools';
import { useRouter } from 'vue-router';
import { useMessengerStore } from 'stores/messenger';
import { useSendTokensStore } from 'stores/sendTokensStore';
import { useNostrStore } from 'stores/nostr';
import DonateDialog from "components/DonateDialog.vue";
import SendTokenDialog from "components/SendTokenDialog.vue";
import { useDonationPresetsStore } from "stores/donationPresets";

const creatorsStore = useCreatorsStore();
const searchQuery = ref('');
const searching = ref(false);
const searchResults = ref([]);
const statusMessage = ref('');
const showRetry = ref(false);
const loadingFeatured = ref(false);
const featuredCreators = ref([]);
const featuredStatusMessage = ref('');

const debouncedSearch = debounce(handleSearch, 300);

function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

async function handleSearch() {
  const query = searchQuery.value.trim();
  if (!query) {
    searchResults.value = [];
    return;
  }

  searching.value = true;
  statusMessage.value = '';
  showRetry.value = false;

  try {
    const profiles = await creatorsStore.searchCreators(query);
    searchResults.value = profiles.map(profile => ({
      ...profile,
      npub: nip19.npubEncode(profile.pubkey),
      npubShort: `${nip19.npubEncode(profile.pubkey).substring(0, 10)}...${nip19.npubEncode(profile.pubkey).substring(nip19.npubEncode(profile.pubkey).length - 5)}`
    }));
  } catch (error) {
    console.error('Search failed:', error);
    statusMessage.value = 'Search failed. Please try again.';
    showRetry.value = true;
  } finally {
    searching.value = false;
  }
}

function retrySearch() {
  handleSearch();
}

async function loadFeatured() {
  loadingFeatured.value = true;
  featuredStatusMessage.value = '';
  try {
    await creatorCacheService.start();
    const profiles = await creatorsStore.loadFeaturedCreators();
    featuredCreators.value = profiles.map(profile => ({
      ...profile,
      npub: nip19.npubEncode(profile.pubkey),
      npubShort: `${nip19.npubEncode(profile.pubkey).substring(0, 10)}...${nip19.npubEncode(profile.pubkey).substring(nip19.npubEncode(profile.pubkey).length - 5)}`
    }));
  } catch (error) {
    console.error('Failed to load featured creators:', error);
    featuredStatusMessage.value = 'Could not load featured creators.';
  } finally {
    loadingFeatured.value = false;
  }
}

const router = useRouter();
const messenger = useMessengerStore();
const sendTokensStore = useSendTokensStore();
const nostr = useNostrStore();
const showDonateDialog = ref(false);
const selectedPubkey = ref("");
const donationStore = useDonationPresetsStore();

function viewProfile(pubkey: string) {
  router.push({ name: 'PublicCreatorProfile', params: { npubOrHex: pubkey } });
}

function startChat(pubkey: string) {
  const resolvedPubkey = nostr.resolvePubkey(pubkey);
  router.push({ path: "/nostr-messenger", query: { pubkey: resolvedPubkey } });
  const stop = watch(
    () => messenger.started,
    (started) => {
      if (started) {
        messenger.startChat(resolvedPubkey);
        stop();
      }
    },
  );
}

function donate(pubkey: string) {
  selectedPubkey.value = pubkey;
  showDonateDialog.value = true;
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

function copyToClipboard(text: string, buttonElement: HTMLElement) {
  navigator.clipboard.writeText(text).then(() => {
    const originalText = buttonElement.textContent;
    buttonElement.textContent = 'Copied!';
    setTimeout(() => {
      buttonElement.textContent = originalText;
    }, 2000);
  }).catch(err => {
    console.error('Failed to copy text: ', err);
  });
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
  border-radius: 0.75rem; /* Tailwind rounded-xl */
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1),
    0 4px 6px -2px rgba(0, 0, 0, 0.05); /* Tailwind shadow-lg */
}
.search-input {
  width: 100%;
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
.result-item,
.creator-card {
  padding: 1.25rem;
  border: 1px solid #e2e8f0; /* Tailwind gray-300 */
  border-radius: 0.75rem; /* Tailwind rounded-xl */
  margin-bottom: 1rem;
  background-color: #fdfdff; /* Slightly off-white */
  transition: all 0.2s ease-in-out;
  display: flex;
  flex-direction: column; /* Ensure actions container is below info */
  gap: 0.5rem; /* Reduced gap for tighter layout within card */
}
.creator-card {
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.07),
    0 2px 4px -1px rgba(0, 0, 0, 0.04);
  position: relative;
}
.result-item {
  position: relative;
}
.result-item:hover,
.creator-card:hover {
  background-color: #f0f5ff; /* Lighter blue hover */
  border-color: #bee3f8; /* Tailwind blue-200 */
  transform: translateY(-2px);
  box-shadow: 0 8px 25px -5px rgba(0, 0, 0, 0.1),
    0 10px 10px -5px rgba(0, 0, 0, 0.04);
}
.profile-header {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  width: 100%;
}
.profile-header img.avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid #e2e8f0; /* Tailwind gray-300 */
  flex-shrink: 0;
}
.profile-header .info {
  flex-grow: 1;
  min-width: 0;
}
.profile-header .info h3 {
  font-size: 1.125rem; /* Tailwind text-lg */
  font-weight: 600; /* Tailwind font-semibold */
  color: #2d3748; /* Tailwind gray-800 */
  word-break: break-word;
  margin-bottom: 0.25rem;
}
.profile-header .info p {
  font-size: 0.875rem; /* Tailwind text-sm */
  color: #4a5568; /* Tailwind gray-700 */
  margin-top: 0.1rem;
  word-break: break-word;
  line-height: 1.4;
}
.profile-header .info .nip05 {
  font-weight: 500;
  color: #3182ce; /* Tailwind blue-600 */
}
.creator-actions {
  opacity: 0;
  transition: opacity 0.3s ease-in-out;
  padding-top: 0.5rem;
  display: flex;
  gap: 0.5rem;
  width: 100%;
  justify-content: flex-start;
}
.creator-card:hover .creator-actions,
.result-item:hover .creator-actions {
  opacity: 1;
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
.message-button {
  background-color: #4299e1;
}
.message-button:hover {
  background-color: #3182ce;
}
.donate-button {
  background-color: #48bb78;
}
.donate-button:hover {
  background-color: #38a169;
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
  background-color: #2d3748;
  color: #e2e8f0;
}
body.dark .search-input {
  background-color: #2d3748;
  border-color: #4a5568;
  color: #e2e8f0;
}
body.dark .result-item,
body.dark .creator-card {
  background-color: #2d3748;
  border-color: #4a5568;
}
body.dark .result-item:hover,
body.dark .creator-card:hover {
  background-color: #4a5568;
  border-color: #718096;
}
body.dark .profile-header .info h3 {
  color: #e2e8f0;
}
body.dark .profile-header .info p {
  color: #a0aec0;
}
body.dark .profile-header .info .nip05 {
  color: #63b3ed;
}
</style>