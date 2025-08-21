<template>
  <q-dialog v-model="model">
    <q-card style="max-width:400px">
      <q-card-section class="text-h6">
        {{ t('Welcome.nostr.backupTitle') }}
      </q-card-section>
      <q-card-section>
        <q-input :model-value="nsec" readonly dense>
          <template #append>
            <q-btn flat icon="content_copy" @click="copy" :aria-label="t('global.actions.copy.label')" />
          </template>
        </q-input>
        <p class="text-caption q-mt-sm">
          {{ t('Welcome.nostr.backupWarning') }}
        </p>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat color="primary" :label="t('Welcome.nostr.backupOk')" @click="model = false" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { copyToClipboard } from 'quasar'

const props = defineProps<{ modelValue: boolean; nsec: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()
const { t } = useI18n()

const model = ref(props.modelValue)
watch(() => props.modelValue, v => (model.value = v))
watch(model, v => emit('update:modelValue', v))

async function copy() {
  try {
    await copyToClipboard(props.nsec)
  } catch {
    // ignore copy errors
  }
}
</script>
