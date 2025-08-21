<template>
  <q-drawer
    v-model="ui.mainNavOpen"
    side="left"
    :overlay="$q.screen.lt.md"
    :breakpoint="1024"
    :width="NAV_DRAWER_WIDTH"
    bordered
    behavior="mobile"
    :no-swipe-backdrop="false"
    :no-swipe-open="false"
    class="app-nav-drawer"
    id="app-nav"
    elevated
    tabindex="0"
    :content-class="drawerContentClass"
    @hide="ui.closeMainNav()"
    @keyup.esc="ui.closeMainNav()"
  >
    <q-list>
      <q-item-label header>{{
        $t("MainHeader.menu.settings.title")
      }}</q-item-label>
      <q-item clickable @click="gotoWallet">
        <q-item-section avatar>
          <q-icon name="account_balance_wallet" />
        </q-item-section>
        <q-item-section>
          <q-item-label>{{
            $t("FullscreenHeader.actions.back.label")
          }}</q-item-label>
        </q-item-section>
      </q-item>
      <q-item clickable @click="gotoSettings">
        <q-item-section avatar>
          <q-icon name="settings" />
        </q-item-section>
        <q-item-section>
          <q-item-label>{{
            $t("MainHeader.menu.settings.settings.title")
          }}</q-item-label>
          <q-item-label caption>{{
            $t("MainHeader.menu.settings.settings.caption")
          }}</q-item-label>
        </q-item-section>
      </q-item>
      <q-item clickable @click="gotoFindCreators">
        <q-item-section avatar>
          <q-icon name="img:icons/find-creators.svg" color="white" />
        </q-item-section>
        <q-item-section>
          <q-item-label>{{
            $t("MainHeader.menu.findCreators.findCreators.title")
          }}</q-item-label>
          <q-item-label caption>{{
            $t("MainHeader.menu.findCreators.findCreators.caption")
          }}</q-item-label>
        </q-item-section>
      </q-item>
      <q-item clickable @click="gotoCreatorHub">
        <q-item-section avatar>
          <q-icon name="img:icons/creator-hub.svg" color="white" />
        </q-item-section>
        <q-item-section>
          <q-item-label>{{
            $t("MainHeader.menu.creatorHub.title")
          }}</q-item-label>
          <q-item-label caption>{{
            $t("MainHeader.menu.creatorHub.caption")
          }}</q-item-label>
        </q-item-section>
      </q-item>
      <q-item clickable @click="gotoMyProfile">
        <q-item-section avatar>
          <q-icon name="person" />
        </q-item-section>
        <q-item-section>
          <q-item-label>{{
            $t("MainHeader.menu.myProfile.myProfile.title")
          }}</q-item-label>
          <q-item-label caption>{{
            $t("MainHeader.menu.myProfile.myProfile.caption")
          }}</q-item-label>
        </q-item-section>
      </q-item>
      <q-item clickable @click="gotoBuckets">
        <q-item-section avatar>
          <q-icon name="inventory_2" />
        </q-item-section>
        <q-item-section>
          <q-item-label>{{
            $t("MainHeader.menu.buckets.buckets.title")
          }}</q-item-label>
          <q-item-label caption>{{
            $t("MainHeader.menu.buckets.buckets.caption")
          }}</q-item-label>
        </q-item-section>
      </q-item>
      <q-item clickable @click="gotoSubscriptions">
        <q-item-section avatar>
          <q-icon name="auto_awesome_motion" />
        </q-item-section>
        <q-item-section>
          <q-item-label>{{
            $t("MainHeader.menu.subscriptions.subscriptions.title")
          }}</q-item-label>
          <q-item-label caption>{{
            $t("MainHeader.menu.subscriptions.subscriptions.caption")
          }}</q-item-label>
        </q-item-section>
      </q-item>
      <q-item clickable @click="gotoChats">
        <q-item-section avatar>
          <q-icon name="chat" />
        </q-item-section>
        <q-item-section>
          <q-item-label>Chats</q-item-label>
        </q-item-section>
      </q-item>
      <q-item v-if="needsNostrLogin" clickable @click="gotoNostrLogin">
        <q-item-section avatar>
          <q-icon name="vpn_key" />
        </q-item-section>
        <q-item-section>
          <q-item-label>Setup Nostr Identity</q-item-label>
        </q-item-section>
      </q-item>
      <q-item-label header>{{
        $t("MainHeader.menu.terms.title")
      }}</q-item-label>
      <q-item clickable @click="gotoTerms">
        <q-item-section avatar>
          <q-icon name="gavel" />
        </q-item-section>
        <q-item-section>
          <q-item-label>{{
            $t("MainHeader.menu.terms.terms.title")
          }}</q-item-label>
          <q-item-label caption>{{
            $t("MainHeader.menu.terms.terms.caption")
          }}</q-item-label>
        </q-item-section>
      </q-item>
      <q-item-label header>{{
        $t("MainHeader.menu.about.title")
      }}</q-item-label>
      <q-item clickable @click="gotoAbout">
        <q-item-section avatar>
          <q-icon name="info" />
        </q-item-section>
        <q-item-section>
          <q-item-label>{{
            $t("MainHeader.menu.about.about.title")
          }}</q-item-label>
          <q-item-label caption>{{
            $t("MainHeader.menu.about.about.caption")
          }}</q-item-label>
        </q-item-section>
      </q-item>
      <q-item-label header>{{
        $t("MainHeader.menu.links.title")
      }}</q-item-label>
      <EssentialLink
        v-for="link in essentialLinks"
        :key="link.title"
        v-bind="link"
        @click="ui.closeMainNav()"
      />
    </q-list>
  </q-drawer>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useUiStore } from "src/stores/ui";
import { useNostrStore } from "src/stores/nostr";
import { useI18n } from "vue-i18n";
import { useQuasar } from "quasar";
import EssentialLink from "components/EssentialLink.vue";
import { NAV_DRAWER_WIDTH } from "src/constants/layout";

const ui = useUiStore();
const router = useRouter();
const nostrStore = useNostrStore();
const { t } = useI18n();
const $q = useQuasar();

function goto(path: string) {
  router.push(path);
  ui.closeMainNav();
}
const gotoWallet = () => goto("/wallet");
const gotoSettings = () => goto("/settings");
const gotoFindCreators = () => goto("/find-creators");
const gotoCreatorHub = () => goto("/creator-hub");
const gotoMyProfile = () => goto("/my-profile");
const gotoBuckets = () => goto("/buckets");
const gotoSubscriptions = () => goto("/subscriptions");
const gotoChats = () => goto("/nostr-messenger");
const gotoNostrLogin = () => goto("/nostr-login");
const gotoTerms = () => goto("/terms");
const gotoAbout = () => goto("/about");

const needsNostrLogin = computed(() => !nostrStore.privateKeySignerPrivateKey);

const drawerContentClass = computed(() =>
  $q.screen.lt.md ? "main-nav-safe" : "q-pt-sm"
);

const essentialLinks = [
  {
    title: t("MainHeader.menu.links.fundstrCreator.title"),
    caption: t("MainHeader.menu.links.fundstrCreator.caption"),
    icon: "web",
    link: "https://primal.net/KalonAxiarch",
  },
  {
    title: t("MainHeader.menu.links.cashuSpace.title"),
    caption: t("MainHeader.menu.links.cashuSpace.caption"),
    icon: "web",
    link: "https://cashu.space",
  },
  {
    title: t("MainHeader.menu.links.github.title"),
    caption: t("MainHeader.menu.links.github.caption"),
    icon: "code",
    link: "https://github.com/cashubtc/Fundstr",
  },
  {
    title: t("MainHeader.menu.links.telegram.title"),
    caption: t("MainHeader.menu.links.telegram.caption"),
    icon: "chat",
    link: "https://t.me/CashuMe",
  },
  {
    title: t("MainHeader.menu.links.twitter.title"),
    caption: t("MainHeader.menu.links.twitter.caption"),
    icon: "rss_feed",
    link: "https://twitter.com/CashuBTC",
  },
  {
    title: t("MainHeader.menu.links.donate.title"),
    caption: t("MainHeader.menu.links.donate.caption"),
    icon: "favorite",
    link: "https://docs.cashu.space/contribute",
  },
];
</script>

<style scoped>
.app-nav-drawer {
  z-index: 1000;
  transition: transform 0.18s ease, opacity 0.18s ease;
  backdrop-filter: saturate(1.2);
  box-shadow: 2px 0 4px rgba(0, 0, 0, 0.1);
  border-right: 1px solid rgba(0, 0, 0, 0.12);
}

.body--dark .app-nav-drawer {
  border-right: 1px solid rgba(255, 255, 255, 0.24);
}

.main-nav-safe {
  padding-left: calc(env(safe-area-inset-left) + 60px);
  padding-top: calc(env(safe-area-inset-top) + 8px);
}
</style>
