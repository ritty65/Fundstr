<template>
  <section role="region" :aria-labelledby="id" class="q-pa-md flex flex-center">
    <div class="text-center">
      <q-icon name="check_circle" size="4em" color="primary" />
      <h1 :id="id" tabindex="-1" class="q-mt-md">{{ $t("Welcome.finish.title") }}</h1>

      <div class="q-mt-lg column items-center q-gutter-sm">
        <q-btn
          color="primary"
          class="q-mb-sm"
          @click="openWallet"
          :label="$t('Welcome.finish.ctas.openWallet')"
        />
        <q-expansion-item
          class="q-mt-sm"
          icon="tune"
          :label="$t('Welcome.finish.optional')"
          dense
        >
          <div class="q-pa-sm column items-center q-gutter-sm">
            <q-btn
              outline
              @click="addMint"
              :label="$t('Welcome.finish.ctas.addMint')"
            />
            <q-btn
              outline
              @click="createBuckets"
              :label="$t('Welcome.finish.ctas.createBuckets')"
            />
            <q-btn flat @click="restore" :label="$t('Welcome.finish.ctas.restore')" />
          </div>
        </q-expansion-item>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const id = "welcome-finish-title";
const props = defineProps<{
  onAddMint?: () => void;
  onCreateBuckets?: () => void;
  onRestore?: () => void;
}>();
const emit = defineEmits<{ (e: 'open-wallet'): void }>();

function addMint() {
  props.onAddMint?.();
}

function createBuckets() {
  props.onCreateBuckets?.();
}

function restore() {
  props.onRestore?.();
}

function openWallet() {
  emit('open-wallet');
}
</script>

<style scoped>
h1 {
  font-weight: bold;
}
</style>
