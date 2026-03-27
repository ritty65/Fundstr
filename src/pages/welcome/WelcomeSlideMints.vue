<template>
  <section role="region" :aria-labelledby="id" class="q-pa-md flex flex-center">
    <div class="text-center q-mx-auto" style="max-width: 600px">
      <q-icon name="factory" size="4em" color="primary" />
      <h1 :id="id" tabindex="-1" class="q-mt-md">
        {{ t("Welcome.mints.title") }}
      </h1>
      <p class="q-mt-sm">{{ t("Welcome.mints.lead") }}</p>
      <p class="text-caption q-mt-sm">{{ t("Welcome.mints.primer") }}</p>
      <p class="text-caption q-mt-sm">
        These mints were recommended by other Nostr users. Read reviews at
        <a href="https://bitcoinmints.com" target="_blank" rel="noopener"
          >bitcoinmints.com</a
        >. Be careful and do your own research before using a mint.
      </p>
      <div class="q-mt-sm">
        <q-btn
          flat
          dense
          icon="factory"
          data-testid="welcome-mints-browse"
          @click="showCatalog = true"
          label="Click to browse mints"
          :disable="!recommendedMints.length"
        />
      </div>
      <q-banner
        v-if="connected.length"
        dense
        rounded
        class="q-mt-md bg-surface-2 text-1"
      >
        <div class="text-subtitle2">Mint saved</div>
        <div class="text-caption text-2 q-mt-xs">
          {{ activeConnectedMintUrl || connected[0]?.url }}
        </div>
      </q-banner>
      <q-form class="q-mt-md" @submit.prevent="connect">
        <q-select
          v-model="url"
          :options="recommendedMints"
          :option-label="(opt) => opt.label || opt.url"
          option-value="url"
          emit-value
          map-options
          use-input
          input-debounce="0"
          @new-value="onNewValue"
          :placeholder="t('Welcome.mints.placeholder')"
        />
        <div v-if="error" class="text-negative text-caption q-mt-xs">
          {{ error }}
        </div>
        <q-btn
          color="primary"
          class="q-mt-md"
          :loading="loading"
          type="submit"
          :label="t('Welcome.mints.connect')"
        />
      </q-form>
      <div v-if="connected.length" class="q-mt-md">
        <div
          v-for="m in connected"
          :key="m.url"
          class="row items-center justify-between q-my-xs"
        >
          <div class="row items-center">
            <q-icon name="check" color="positive" class="q-mr-sm" />
            <span>{{ m.nickname || m.url }}</span>
          </div>
          <q-btn
            flat
            dense
            icon="delete"
            color="negative"
            @click="remove(m.url)"
          />
        </div>
        <q-btn
          flat
          color="primary"
          class="q-mt-sm"
          @click="addAnother"
          :label="t('Welcome.mints.addAnother')"
        />
      </div>
      <q-dialog v-model="showCatalog">
        <q-card style="min-width: 300px" data-testid="welcome-mints-dialog">
          <q-card-section>
            <div class="text-h6">{{ t("Welcome.mints.browse") }}</div>
          </q-card-section>
          <q-list>
            <q-item
              v-for="(mint, i) in recommendedMints"
              :key="mint.url"
              :data-testid="`welcome-mint-option-${i}`"
              clickable
              :disable="loading"
              :active="normalizeMintUrl(url) === normalizeMintUrl(mint.url)"
              active-class="bg-surface-1 text-primary"
              @click="selectMint(mint.url)"
            >
              <q-item-section>{{ mint.label || mint.url }}</q-item-section>
              <q-item-section side>
                <q-spinner
                  v-if="catalogConnectingMintUrl === normalizeMintUrl(mint.url)"
                  color="primary"
                  size="18px"
                />
                <q-icon
                  v-else-if="isConnectedMint(mint.url)"
                  name="check_circle"
                  color="positive"
                />
              </q-item-section>
            </q-item>
          </q-list>
          <q-card-actions align="right">
            <q-btn
              flat
              :disable="loading"
              :label="t('global.actions.close.label')"
              v-close-popup
            />
          </q-card-actions>
        </q-card>
      </q-dialog>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useQuasar } from "quasar";
import { useWelcomeStore } from "src/stores/welcome";
import { useMintsStore } from "src/stores/mints";

const { t } = useI18n();
const $q = useQuasar();
const welcome = useWelcomeStore();
const mints = useMintsStore();
const id = "welcome-mints-title";
const url = ref((import.meta.env.VITE_RECOMMENDED_MINT_URL as string) || "");
const error = ref("");
const loading = ref(false);
const connected = ref<any[]>([]);
const showCatalog = ref(false);
const recommendedMints = ref<{ label: string; url: string }[]>([]);
const catalogConnectingMintUrl = ref("");

function normalizeMintUrl(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(
      /^[a-zA-Z]+:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`,
    );
    parsed.hash = "";
    parsed.search = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return trimmed.replace(/\/$/, "");
  }
}

const activeConnectedMintUrl = computed(() =>
  normalizeMintUrl(mints.activeMintUrl || connected.value[0]?.url || ""),
);

function syncConnectedState() {
  connected.value = [...mints.mints];
  welcome.mintConnected = connected.value.length > 0;
}

function isConnectedMint(mintUrl: string) {
  const normalized = normalizeMintUrl(mintUrl);
  return connected.value.some(
    (mint) => normalizeMintUrl(mint.url) === normalized,
  );
}

function sanitizeMintInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("invalid");
  }

  const withProtocol = /^[a-zA-Z]+:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  if (/\s/.test(withProtocol)) {
    throw new Error("invalid");
  }

  const parsed = new URL(withProtocol);
  if (parsed.protocol !== "https:") {
    throw new Error("invalid");
  }

  parsed.hash = "";
  parsed.search = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  return parsed.toString().replace(/\/$/, "");
}

function mintErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("invalid mint url")) {
    return t("Welcome.mints.errorInvalid");
  }
  if (
    message.includes("network") ||
    message.includes("connect") ||
    message.includes("fetch") ||
    message.includes("timeout") ||
    message.includes("cors")
  ) {
    return t("Welcome.mints.errorUnreachable");
  }
  return t("Welcome.mints.errorResponse");
}

async function loadRecommendedMints() {
  try {
    const resp = await fetch("/mints.json");
    if (!resp.ok) throw new Error("network");
    const data = await resp.json();
    recommendedMints.value = Array.isArray(data)
      ? data.map((m: any) => ({ url: m.url, label: m.label || m.url }))
      : [];
    if (
      !recommendedMints.value.length &&
      import.meta.env.VITE_RECOMMENDED_MINTS
    ) {
      recommendedMints.value = (
        import.meta.env.VITE_RECOMMENDED_MINTS as string
      )
        .split(",")
        .map((u) => ({ url: u.trim(), label: u.trim() }));
    }
    if (
      !recommendedMints.value.length &&
      import.meta.env.VITE_RECOMMENDED_MINT_URL
    ) {
      recommendedMints.value.push({
        url: import.meta.env.VITE_RECOMMENDED_MINT_URL as string,
        label: import.meta.env.VITE_RECOMMENDED_MINT_URL as string,
      });
    }
  } catch {
    if (import.meta.env.VITE_RECOMMENDED_MINTS) {
      recommendedMints.value = (
        import.meta.env.VITE_RECOMMENDED_MINTS as string
      )
        .split(",")
        .map((u) => ({ url: u.trim(), label: u.trim() }));
    } else if (import.meta.env.VITE_RECOMMENDED_MINT_URL) {
      recommendedMints.value.push({
        url: import.meta.env.VITE_RECOMMENDED_MINT_URL as string,
        label: import.meta.env.VITE_RECOMMENDED_MINT_URL as string,
      });
    } else {
      $q.notify({ type: "negative", message: t("Welcome.mints.errorLoad") });
    }
  }
}

onMounted(() => {
  if (mints.mints.length > 0) {
    syncConnectedState();
    if (!url.value && activeConnectedMintUrl.value) {
      url.value = activeConnectedMintUrl.value;
    }
  }
  loadRecommendedMints();
});

async function connect(options: { closeCatalogOnSuccess?: boolean } = {}) {
  error.value = "";
  let normalizedUrl = "";
  try {
    normalizedUrl = sanitizeMintInput(url.value);
  } catch {
    error.value = t("Welcome.mints.errorInvalid");
    return;
  }

  loading.value = true;
  if (options.closeCatalogOnSuccess) {
    catalogConnectingMintUrl.value = normalizedUrl;
  }
  try {
    const existing = mints.mints.find(
      (mint) => normalizeMintUrl(mint.url) === normalizedUrl,
    );
    if (existing) {
      await mints.activateMintUrl(existing.url, false, true);
    } else {
      await mints.addMint({ url: normalizedUrl }, true);
    }

    syncConnectedState();
    url.value = "";
    if (options.closeCatalogOnSuccess) {
      showCatalog.value = false;
    }
  } catch (cause) {
    error.value = mintErrorMessage(cause);
  } finally {
    catalogConnectingMintUrl.value = "";
    loading.value = false;
  }
}

function addAnother() {
  url.value = "";
  error.value = "";
}

async function selectMint(mintUrl: string) {
  url.value = mintUrl;
  await connect({ closeCatalogOnSuccess: true });
}

function onNewValue(val: string, done: (val: any, mode?: string) => void) {
  const opt = { url: val, label: val };
  done(opt, "add-unique");
}

async function remove(mintUrl: string) {
  await mints.removeMint(mintUrl);
  syncConnectedState();
  if (!connected.value.length) {
    url.value = "";
  }
}
</script>

<style scoped>
h1 {
  font-weight: bold;
}
</style>
