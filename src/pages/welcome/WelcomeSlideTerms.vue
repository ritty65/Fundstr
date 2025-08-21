<template>
  <section role="region" :aria-labelledby="id" class="q-pa-md flex flex-center">
    <div class="text-center">
      <q-icon name="gavel" size="4em" color="primary" />
      <h1 :id="id" tabindex="-1" class="q-mt-md">{{ $t("Welcome.terms.title") }}</h1>
      <div class="q-mt-sm">
        <q-btn
          flat
          color="primary"
          @click="showTerms = true"
          :label="$t('Welcome.terms.link')"
        />
      </div>
      <q-checkbox
        class="q-mt-md"
        v-model="accepted"
        :label="$t('Welcome.terms.accept')"
        aria-label="$t('Welcome.terms.accept')"
      />

      <q-dialog v-model="showTerms">
        <q-card style="max-width: 720px; width: 90vw;">
          <q-card-section>
            <div class="text-h6">{{ $t("Welcome.terms.title") }}</div>
          </q-card-section>
          <q-separator />
          <q-card-section class="q-pa-none">
            <q-scroll-area style="height: 60vh">
              <div class="q-pa-md">
                <p class="q-mb-md">
                  {{ $t('Welcome.terms.summary') || 'Please review the terms below.' }}
                </p>
                <TermsContent />
              </div>
            </q-scroll-area>
          </q-card-section>
          <q-separator />
          <q-card-actions align="between">
            <q-btn flat :label="$t('global.actions.close.label')" v-close-popup />
            <q-btn
              color="primary"
              :label="$t('Welcome.terms.accept')"
              @click="acceptAndClose"
            />
          </q-card-actions>
        </q-card>
      </q-dialog>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import TermsContent from 'src/components/TermsContent.vue'
import { useWelcomeStore } from 'src/stores/welcome'

const id = 'welcome-terms-title'
const showTerms = ref(false)
const accepted = ref(false)
const welcome = useWelcomeStore()

watch(accepted, (val) => {
  welcome.termsAccepted = val
})

function acceptAndClose() {
  accepted.value = true
  welcome.termsAccepted = true
  showTerms.value = false
}
</script>

<style scoped>
h1 {
  font-weight: bold;
}
</style>
