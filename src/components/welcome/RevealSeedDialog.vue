<template>
  <q-dialog v-model="model">
    <q-card>
      <q-card-section class="row items-center">
        <div class="text-h6">{{ $t('Welcome.backup.revealSeed') }}</div>
        <q-space />
        <q-btn flat round dense icon="content_copy" @click="copy" />
      </q-card-section>
      <q-card-section>
        <div class="q-mt-sm">{{ seed }}</div>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat :label="$t('global.actions.close.label')" v-close-popup />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'

const model = defineModel<boolean>({ default: false })
const props = defineProps<{ seed: string }>()
const { t } = useI18n()
const $q = useQuasar()

function copy() {
  navigator.clipboard.writeText(props.seed)
  $q.notify({ type: 'positive', message: t('global.copied') })
}
</script>
