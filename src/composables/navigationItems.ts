import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

export interface NavigationItem {
  id: string
  menuItem: string
  icon: string
  fanText: string
  creatorText: string
}

export function useNavigationItems() {
  const { t } = useI18n()
  return computed<NavigationItem[]>(() => [
    {
      id: 'wallet',
      menuItem: t('MainHeader.menu.wallet.title'),
      icon: 'account_balance_wallet',
      fanText: t('AboutPage.navigation.items.wallet.fan'),
      creatorText: t('AboutPage.navigation.items.wallet.creator'),
    },
    {
      id: 'settings',
      menuItem: t('MainHeader.menu.settings.title'),
      icon: 'settings',
      fanText: t('AboutPage.navigation.items.settings.fan'),
      creatorText: t('AboutPage.navigation.items.settings.creator'),
    },
    {
      id: 'findCreators',
      menuItem: t('MainHeader.menu.findCreators.title'),
      icon: 'img:icons/find-creators.svg',
      fanText: t('AboutPage.navigation.items.findCreators.fan'),
      creatorText: t('AboutPage.navigation.items.findCreators.creator'),
    },
    {
      id: 'creatorHub',
      menuItem: t('MainHeader.menu.creatorHub.title'),
      icon: 'img:icons/creator-hub.svg',
      fanText: t('AboutPage.navigation.items.creatorHub.fan'),
      creatorText: t('AboutPage.navigation.items.creatorHub.creator'),
    },
    {
      id: 'myProfile',
      menuItem: t('MainHeader.menu.myProfile.title'),
      icon: 'person',
      fanText: t('AboutPage.navigation.items.myProfile.fan'),
      creatorText: t('AboutPage.navigation.items.myProfile.creator'),
    },
    {
      id: 'buckets',
      menuItem: t('MainHeader.menu.buckets.title'),
      icon: 'inventory_2',
      fanText: t('AboutPage.navigation.items.buckets.fan'),
      creatorText: t('AboutPage.navigation.items.buckets.creator'),
    },
    {
      id: 'subscriptions',
      menuItem: t('MainHeader.menu.subscriptions.title'),
      icon: 'auto_awesome_motion',
      fanText: t('AboutPage.navigation.items.subscriptions.fan'),
      creatorText: t('AboutPage.navigation.items.subscriptions.creator'),
    },
    {
      id: 'chats',
      menuItem: t('MainHeader.menu.nostrMessenger.title'),
      icon: 'chat',
      fanText: t('AboutPage.navigation.items.chats.fan'),
      creatorText: t('AboutPage.navigation.items.chats.creator'),
    },
    {
      id: 'restore',
      menuItem: t('MainHeader.menu.restore.title'),
      icon: 'settings_backup_restore',
      fanText: t('AboutPage.navigation.items.restore.fan'),
      creatorText: t('AboutPage.navigation.items.restore.creator'),
    },
    {
      id: 'alreadyRunning',
      menuItem: t('MainHeader.menu.alreadyRunning.title'),
      icon: 'warning',
      fanText: t('AboutPage.navigation.items.alreadyRunning.fan'),
      creatorText: t('AboutPage.navigation.items.alreadyRunning.creator'),
    },
    {
      id: 'welcome',
      menuItem: t('MainHeader.menu.welcome.title'),
      icon: 'info',
      fanText: t('AboutPage.navigation.items.welcome.fan'),
      creatorText: t('AboutPage.navigation.items.welcome.creator'),
    },
    {
      id: 'terms',
      menuItem: t('MainHeader.menu.terms.title'),
      icon: 'gavel',
      fanText: t('AboutPage.navigation.items.terms.fan'),
      creatorText: t('AboutPage.navigation.items.terms.creator'),
    },
    {
      id: 'about',
      menuItem: t('MainHeader.menu.about.title'),
      icon: 'info',
      fanText: t('AboutPage.navigation.items.about.fan'),
      creatorText: t('AboutPage.navigation.items.about.creator'),
    },
    {
      id: 'links',
      menuItem: t('MainHeader.menu.links.title'),
      icon: 'link',
      fanText: t('AboutPage.navigation.items.externalLinks.fan'),
      creatorText: t('AboutPage.navigation.items.externalLinks.creator'),
    },
    {
      id: 'nostrLogin',
      menuItem: t('MainHeader.menu.nostrLogin.title'),
      icon: 'vpn_key',
      fanText: t('AboutPage.navigation.items.nostrLogin.fan'),
      creatorText: t('AboutPage.navigation.items.nostrLogin.creator'),
    },
  ])
}
