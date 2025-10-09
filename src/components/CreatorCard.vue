<template>
  <div class="creator-card group">
    <div class="profile-header">
      <img
        class="avatar"
        :src="profile.profile?.picture || `https://placehold.co/50x50/A0AEC0/FFFFFF?text=${(profile.profile?.name || 'N')[0]?.toUpperCase()}`"
        :alt="profile.profile?.name || 'Nostr User'"
      />
      <div class="info">
        <h3>{{ profile.profile?.name || (profile.profile?.nip05 ? profile.profile.nip05.split('@')[0] : 'Unnamed User') }}</h3>
        <p>
          <strong>Npub:</strong> {{ npubShort }}
          <button class="copy-button" @click.stop="copyToClipboard(npub, $event.target)">Copy</button>
        </p>
        <p v-if="profile.profile?.nip05"><strong>NIP-05:</strong> <span class="nip05">{{ profile.profile.nip05 }}</span></p>
        <p v-if="profile.profile?.about"><em>{{ profile.profile.about.substring(0, 80) }}{{ profile.profile.about.length > 80 ? '...' : '' }}</em></p>
        <p v-if="profile.followers"><strong>Followers:</strong> {{ profile.followers }}</p>
      </div>
    </div>
    <div class="creator-actions">
      <button class="action-button view-button" @click.stop="$emit('view-tiers', profile.pubkey)">View Subscription Tiers</button>
      <button class="action-button message-button" @click.stop="$emit('message', profile.pubkey)">Message</button>
      <button class="action-button donate-button" @click.stop="$emit('donate', profile.pubkey)">Donate</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { nip19 } from 'nostr-tools';
import type { CreatorProfile } from 'stores/creators';

const props = defineProps<{
  profile: CreatorProfile;
}>();

defineEmits(['view-tiers', 'message', 'donate']);

const npub = computed(() => nip19.npubEncode(props.profile.pubkey));
const npubShort = computed(() => `${npub.value.substring(0, 10)}...${npub.value.substring(npub.value.length - 5)}`);

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
</script>

<style scoped>
.creator-card {
  padding: 1.5rem;
  border: 1px solid #e2e8f0; /* Tailwind gray-300 */
  border-radius: 0.75rem; /* Tailwind rounded-xl */
  background-color: #ffffff;
  transition: all 0.3s ease-in-out;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05),
    0 2px 4px -1px rgba(0, 0, 0, 0.03);
}

.creator-card:hover {
  border-color: #a0aec0; /* Tailwind gray-400 */
  transform: translateY(-3px);
  box-shadow: 0 10px 20px -5px rgba(0, 0, 0, 0.1),
    0 8px 8px -5px rgba(0, 0, 0, 0.04);
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

.creator-card:hover .creator-actions {
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

.copy-button {
  background: none;
  border: none;
  color: #4299e1;
  cursor: pointer;
  font-size: 0.75rem;
  margin-left: 0.5rem;
}

body.dark .creator-card {
  background-color: #2d3748; /* Tailwind gray-800 */
  border-color: #4a5568; /* Tailwind gray-700 */
}

body.dark .creator-card:hover {
  background-color: #4a5568; /* Tailwind gray-700 */
  border-color: #a0aec0; /* Tailwind gray-500 */
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