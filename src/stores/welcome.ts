import { defineStore } from 'pinia'
import { useLocalStorage } from '@vueuse/core'

export const LAST_WELCOME_SLIDE = 6

export const useWelcomeStore = defineStore('welcome', {
  state: () => ({
    showWelcome: useLocalStorage('cashu.welcome.show', true),
    currentSlide: useLocalStorage('cashu.welcome.slide', 0),
    seedPhraseValidated: useLocalStorage('cashu.welcome.seedValidated', false),
    walletRestored: useLocalStorage('cashu.welcome.walletRestored', false),
    termsAccepted: useLocalStorage('cashu.welcome.termsAccepted', false),
    nostrSetupCompleted: useLocalStorage('cashu.welcome.nostrSetupCompleted', false),
    mintConnected: useLocalStorage('cashu.welcome.mintConnected', false),
    featuresVisited: useLocalStorage('cashu.welcome.featuresVisited', {
      creatorHub: false,
      subscriptions: false,
      buckets: false,
    }),
    welcomeCompleted: useLocalStorage('cashu.welcome.completed', false),
  }),
  actions: {
    canProceed(slide: number): boolean {
      switch (slide) {
        case 0:
        case 1:
        case 2:
          return true
        case 3:
          return this.seedPhraseValidated || this.walletRestored
        case 4:
          return true
        case 5:
          return this.termsAccepted
        case 6:
          return true
        default:
          return false
      }
    },
    closeWelcome() {
      this.showWelcome = false
      this.currentSlide = 0
      this.featuresVisited = { creatorHub: false, subscriptions: false, buckets: false }
      this.welcomeCompleted = true
    },
  },
})
