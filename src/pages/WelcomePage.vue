<template>
  <q-page class="q-pa-md flex flex-center">
    <div style="width:100%;max-width:600px">
      <div class="row items-center justify-between q-mb-md">
        <div></div>
        <q-btn dense flat icon="checklist" @click="showChecklist = true" />
      </div>
      <div class="text-center q-mb-md">
        <div class="row justify-center q-gutter-sm">
          <q-btn
            v-for="(_, i) in slides"
            :key="i"
            round
            dense
            :label="i + 1"
            :color="i === welcome.currentSlide ? 'primary' : (i < welcome.currentSlide ? 'secondary' : 'grey-4')"
            @click="jump(i)"
            :disable="i > welcome.currentSlide && !welcome.canProceed(i - 1)"
          />
        </div>
        <q-linear-progress class="q-mt-sm" :value="(welcome.currentSlide + 1) / slides.length" />
        <div class="text-caption q-mt-xs">{{ $t('Welcome.footer.step',{n: welcome.currentSlide + 1, total: slides.length}) }}</div>
      </div>
      <component
        :is="slides[welcome.currentSlide].component"
        v-bind="slides[welcome.currentSlide].props"
      />
      <div class="row justify-between q-mt-lg">
        <q-btn flat :disable="welcome.currentSlide === 0" @click="prev" :label="$t('Welcome.footer.previous')" />
        <q-btn
          color="primary"
          :label="welcome.currentSlide === LAST_WELCOME_SLIDE ? $t('Welcome.footer.finish') : $t('Welcome.footer.next')"
          :disable="!welcome.canProceed(welcome.currentSlide)"
          @click="next"
        />
      </div>
      <div class="text-center q-mt-md">
        <a href="https://docs.cashu.space" target="_blank" class="text-primary">{{ $t('Welcome.footer.help') }}</a>
      </div>
    </div>
    <q-dialog v-model="showChecklist">
      <TaskChecklist
        :tasks="tasks"
        :progress="progress"
        :can-finish="canFinish"
        @run="runTask"
        @finish="finishOnboarding"
      />
    </q-dialog>
    <RevealSeedDialog v-model="showSeedDialog" :seed="mnemonicStore.mnemonic" />
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import WelcomeSlideFeatures from './welcome/WelcomeSlideFeatures.vue'
import WelcomeSlideNostr from './welcome/WelcomeSlideNostr.vue'
import WelcomeSlidePwa from './welcome/WelcomeSlidePwa.vue'
import WelcomeSlideBackup from './welcome/WelcomeSlideBackup.vue'
import WelcomeSlideMints from './welcome/WelcomeSlideMints.vue'
import WelcomeSlideTerms from './welcome/WelcomeSlideTerms.vue'
import WelcomeSlideFinish from './welcome/WelcomeSlideFinish.vue'
import TaskChecklist from 'src/components/welcome/TaskChecklist.vue'
import RevealSeedDialog from 'src/components/welcome/RevealSeedDialog.vue'
import type { WelcomeTask } from 'src/types/welcome'
import { useWelcomeStore, LAST_WELCOME_SLIDE } from 'src/stores/welcome'
import { useMnemonicStore } from 'src/stores/mnemonic'
import { useStorageStore } from 'src/stores/storage'
import { useNostrStore } from 'src/stores/nostr'
import { useNdk } from 'src/composables/useNdk'

const { t } = useI18n()
const welcome = useWelcomeStore()
const router = useRouter()
const $q = useQuasar()
const mnemonicStore = useMnemonicStore()
const storageStore = useStorageStore()
const nostr = useNostrStore()
const showSeedDialog = ref(false)
const showChecklist = ref(false)

function revealSeed() {
  showSeedDialog.value = true
}

function downloadBackup() {
  storageStore.exportWalletState()
}

function finishOnboarding() {
  showChecklist.value = false
  welcome.closeWelcome()
  router.push('/')
}

const slides = [
  { component: WelcomeSlideFeatures },
  { component: WelcomeSlideNostr },
  { component: WelcomeSlidePwa },
  {
    component: WelcomeSlideBackup,
    props: { onRevealSeed: revealSeed, onDownloadBackup: downloadBackup },
  },
  { component: WelcomeSlideMints },
  { component: WelcomeSlideTerms },
  { component: WelcomeSlideFinish, props: { onOpenWallet: finishOnboarding } },
]

const tasks = computed<WelcomeTask[]>(() => [
  {
    id: 'nostr',
    icon: 'badge',
    title: t('welcome.tasks.createKey.title'),
    desc: t('welcome.tasks.createKey.desc'),
    done: () => welcome.nostrSetupCompleted,
    ctas: [{ label: t('welcome.tasks.createKey.generate'), action: 'emit', eventName: 'goto', params: { slide: 1 } }],
  },
])

const progress = computed(() => t('welcome.taskList.progress', { done: tasks.value.filter((t) => t.done()).length, total: tasks.value.length }))
const canFinish = computed(() => tasks.value.every((t) => t.done()))

function runTask(task: WelcomeTask) {
  if (task.id === 'nostr') jump(1)
  showChecklist.value = false
}

function next() {
  if (welcome.currentSlide === LAST_WELCOME_SLIDE) {
    finishOnboarding()
  } else if (welcome.canProceed(welcome.currentSlide)) {
    welcome.currentSlide++
  }
}

function prev() {
  if (welcome.currentSlide > 0) welcome.currentSlide--
}

function jump(i: number) {
  if (i <= welcome.currentSlide || welcome.canProceed(i - 1)) {
    welcome.currentSlide = i
  }
}

onMounted(() => {
  nostr
    .initNip07Signer()
    .then(() => {
      if (nostr.signer) {
        useNdk({ requireSigner: true }).catch(() => {})
      }
    })
    .catch(() => {})
})
</script>
