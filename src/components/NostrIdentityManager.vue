<template>
  <div>
    <q-btn
      label="Identity / Relays"
      color="primary"
      @click="showDialog = true"
    />
    <q-dialog v-model="showDialog">
      <q-card style="min-width: 350px">
        <q-card-section class="text-h6">Identity &amp; Relays</q-card-section>
        <q-card-section>
          <q-input v-model="privKey" label="Private Key" type="text" />
          <q-btn
            v-if="hasNip07"
            label="Use NIP-07"
            class="q-mt-sm"
            @click="useNip07"
            :disable="!nip07SignerAvailable"
          >
            <q-tooltip v-if="!nip07SignerAvailable"
              >Unlock or enable your NIP-07 extension</q-tooltip
            >
          </q-btn>
          <q-input
            v-model="pubKey"
            label="Public Key"
            readonly
            class="q-mt-md"
          />
          <div class="q-mt-md">
            <q-input
              v-model="relayInput"
              label="Add Relay"
              @keyup.enter="addRelay"
            />
            <q-list bordered class="q-mt-sm">
              <q-item v-for="(r, index) in relays" :key="index">
                <q-item-section>{{ r }}</q-item-section>
                <q-item-section side>
                  <q-btn flat dense icon="delete" @click="removeRelay(index)" />
                </q-item-section>
              </q-item>
            </q-list>
          </div>
          <div class="q-mt-md">
            <div class="text-subtitle2 q-mb-sm">Aliases</div>
            <q-input v-model="aliasPubkey" label="Pubkey" dense />
            <q-input
              v-model="aliasName"
              label="Alias"
              dense
              class="q-mt-sm"
              @keyup.enter="saveAlias"
            />
            <q-btn class="q-mt-sm" flat label="Add" @click="saveAlias" />
            <q-list bordered class="q-mt-sm">
              <q-item v-for="(alias, key) in aliases" :key="key">
                <q-item-section>
                  <div class="text-caption">{{ key }}</div>
                  <q-input v-model="aliases[key]" dense />
                </q-item-section>
                <q-item-section side>
                  <q-btn flat dense icon="delete" @click="removeAlias(key)" />
                </q-item-section>
              </q-item>
            </q-list>
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat v-close-popup label="Close" />
          <q-btn flat label="Save" @click="save" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useNostrStore } from "src/stores/nostr";
import { useMessengerStore } from "src/stores/messenger";
import { useSettingsStore } from "src/stores/settings";

const nostr = useNostrStore();
const settings = useSettingsStore();
const { nip07SignerAvailable } = storeToRefs(nostr);
const { checkNip07Signer, connectBrowserSigner } = nostr;
const hasNip07 = ref(false);
onMounted(() => {
  checkNip07Signer(true);
  const check = () => {
    if (typeof window !== 'undefined' && (window as any).nostr?.getPublicKey) {
      hasNip07.value = true;
      clearInterval(interval);
      clearTimeout(timeout);
    }
  };
  const interval = setInterval(check, 500);
  const timeout = setTimeout(() => clearInterval(interval), 5000);
  check();
});

const showDialog = ref(false);
const privKey = ref(nostr.activePrivateKeyNsec);
const pubKey = ref(nostr.npub);
const relayInput = ref("");
const relays = ref<string[]>([...settings.defaultNostrRelays]);
const messenger = useMessengerStore();
const aliases = messenger.aliases as any;
const aliasPubkey = ref("");
const aliasName = ref("");

const addRelay = () => {
  if (relayInput.value.trim()) {
    relays.value.push(relayInput.value.trim());
    relayInput.value = "";
  }
};

const removeRelay = (index: number) => {
  relays.value.splice(index, 1);
};

const saveAlias = () => {
  if (!aliasPubkey.value.trim()) return;
  messenger.setAlias(aliasPubkey.value.trim(), aliasName.value.trim());
  aliasPubkey.value = "";
  aliasName.value = "";
};

const removeAlias = (key: string) => {
  messenger.setAlias(key, "");
};

const useNip07 = async () => {
  const available = await checkNip07Signer(true);
  if (!available) return;
  await connectBrowserSigner();
  pubKey.value = nostr.npub;
  privKey.value = nostr.activePrivateKeyNsec;
  showDialog.value = false;
};

const save = async () => {
  settings.defaultNostrRelays = [...relays.value];
  await nostr.updateIdentity(privKey.value as any, settings.defaultNostrRelays);
  pubKey.value = nostr.npub;
  showDialog.value = false;
};
</script>
