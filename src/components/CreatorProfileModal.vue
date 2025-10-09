<template>
  <div v-if="show" class="modal-overlay" @click.self="close">
    <div class="modal-content" :class="{ 'dark': isDarkMode }">
      <button class="close-button" @click="close">&times;</button>
      <div v-if="loading" class="loader"></div>
      <div v-if="!loading && creator" class="creator-profile">
        <div class="profile-header">
          <img :src="creator.profile?.picture || `https://placehold.co/100x100/A0AEC0/FFFFFF?text=${(creator.profile?.name || 'N')[0]?.toUpperCase()}`" class="avatar" alt="Creator Avatar">
          <div class="profile-info">
            <h2>{{ creator.profile?.name || 'Unnamed User' }}</h2>
            <p class="nip05">{{ creator.profile?.nip05 }}</p>
            <p class="about">{{ creator.profile?.about }}</p>
          </div>
        </div>

        <div class="actions-section">
          <button class="action-button message-button" @click="$emit('message', pubkey)">Message</button>
          <button class="action-button donate-button" @click="$emit('donate', pubkey)">Donate</button>
        </div>

        <div class="tiers-section">
          <h3>Subscription Tiers</h3>
          <div v-if="tiers.length" class="tiers-grid">
            <div v-for="tier in tiers" :key="tier.id" class="tier-card">
              <h4>{{ tier.name }}</h4>
              <p class="price">{{ tier.price_sats }} sats</p>
              <ul class="benefits">
                <li v-for="(benefit, index) in tier.benefits" :key="index">{{ benefit }}</li>
              </ul>
            </div>
          </div>
          <p v-else>No subscription tiers found for this creator.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useCreatorsStore } from 'stores/creators';
import type { CreatorProfile, Tier } from 'stores/types';
import { useQuasar } from 'quasar';

const props = defineProps<{
  show: boolean;
  pubkey: string;
}>();

const emit = defineEmits(['close', 'message', 'donate']);

const creatorsStore = useCreatorsStore();
const loading = ref(false);
const creator = ref<CreatorProfile | null>(null);
const tiers = ref<Tier[]>([]);

const $q = useQuasar();
const isDarkMode = computed(() => $q.dark.isActive);

watch(() => props.show, async (newVal) => {
  if (newVal && props.pubkey) {
    loading.value = true;
    creator.value = null;
    tiers.value = [];

    const fetchedCreator = await creatorsStore.fetchCreator(props.pubkey);
    if (fetchedCreator) {
      creator.value = fetchedCreator;
    }

    await creatorsStore.fetchTierDefinitions(props.pubkey);
    if (!creatorsStore.tierFetchError) {
      tiers.value = creatorsStore.tiersMap[props.pubkey] || [];
    }

    loading.value = false;
  }
});

function close() {
  emit('close');
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background-color: white;
  padding: 2rem;
  border-radius: 0.75rem;
  width: min(90%, 600px);
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}

.modal-content.dark {
  background-color: #2d3748;
  color: #e2e8f0;
}

.close-button {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #718096;
}

.modal-content.dark .close-button {
  color: #a0aec0;
}

.loader {
  display: block;
  margin: 3rem auto;
  border: 4px solid #e2e8f0;
  border-top: 4px solid #4299e1;
  border-radius: 50%;
  width: 48px;
  height: 48px;
  animation: spin 1s linear infinite;
}

.creator-profile .profile-header {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid #e2e8f0;
}

.modal-content.dark .creator-profile .profile-header {
  border-bottom-color: #4a5568;
}

.actions-section {
  display: flex;
  gap: 1rem;
  padding-top: 1.5rem;
  border-top: 1px solid #e2e8f0;
  margin-top: 1.5rem;
}

.modal-content.dark .actions-section {
  border-top-color: #4a5568;
}

.action-button {
  flex-grow: 1;
  padding: 0.75rem 1rem;
  font-size: 1rem;
  font-weight: 600;
  border-radius: 0.5rem;
  color: white;
  transition: background-color 0.2s;
  cursor: pointer;
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

.creator-profile .avatar {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid #e2e8f0;
}

.modal-content.dark .creator-profile .avatar {
  border-color: #4a5568;
}

.profile-info h2 {
  font-size: 1.75rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}

.profile-info .nip05 {
  color: #3182ce;
  font-weight: 500;
  margin-bottom: 0.75rem;
}

.modal-content.dark .profile-info .nip05 {
  color: #63b3ed;
}

.profile-info .about {
  font-size: 0.9rem;
  color: #4a5568;
  line-height: 1.5;
}

.modal-content.dark .profile-info .about {
  color: #a0aec0;
}

.tiers-section {
  padding-top: 1.5rem;
}

.tiers-section h3 {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

.tiers-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.tier-card {
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  padding: 1rem;
  transition: all 0.2s ease;
}

.modal-content.dark .tier-card {
  border-color: #4a5568;
}

.tier-card:hover {
  border-color: #4299e1;
  transform: translateY(-2px);
}

.tier-card h4 {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.tier-card .price {
  font-size: 1rem;
  font-weight: 700;
  color: #48bb78;
  margin-bottom: 1rem;
}

.modal-content.dark .tier-card .price {
  color: #68d391;
}

.tier-card .benefits {
  list-style: disc;
  padding-left: 1.25rem;
  font-size: 0.85rem;
  color: #718096;
}

.modal-content.dark .tier-card .benefits {
  color: #a0aec0;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>