import { createApp, markRaw } from "vue";
import {
  Dialog,
  LocalStorage,
  Notify,
  Quasar,
} from "quasar";

import App from "./App.vue";
import registerIcons from "./icons";
import createRouter from "./router";
import createStore from "./stores";

import "quasar/dist/quasar.css";
import "@quasar/extras/roboto-font/roboto-font.css";
import "@quasar/extras/material-icons/material-icons.css";
import "./css/app.scss";
import "./css/base.scss";
import "./css/buckets.scss";

import bootSentry from "./boot/sentry";
import bootFundstrPreload from "./boot/fundstr-preload";
import bootWelcomeGate from "./boot/welcomeGate";
import bootCashu from "./boot/cashu";
import bootI18n from "./boot/i18n";
import bootNotify from "./boot/notify";
import bootNostrProvider from "./boot/nostr-provider";
import bootPrefetchFeaturedCreators from "./boot/prefetch-featured-creators";
import bootFundstrRelay from "./boot/fundstrRelay";
import bootE2eTestApi from "./boot/e2e-test-api";

const quasarConfig = {
  config: {
    dark: true,
  },
  plugins: {
    Notify,
    Dialog,
    LocalStorage,
  },
};

async function bootstrap() {
  const app = createApp(App);

  registerIcons(app);

  app.use(Quasar, quasarConfig);

  const storeFactory = createStore;
  const store =
    typeof storeFactory === "function"
      ? await storeFactory({ ssrContext: null })
      : storeFactory;

  if (store) {
    app.use(store);
  }

  const routerFactory = createRouter;
  const router = markRaw(
    typeof routerFactory === "function"
      ? await routerFactory({ store, ssrContext: null })
      : routerFactory,
  );

  if (store && typeof store.use === "function") {
    store.use(({ store: piniaStore }) => {
      piniaStore.router = router;
    });
  }

  const bootFiles = [
    bootSentry,
    bootFundstrPreload,
    bootWelcomeGate,
    bootCashu,
    bootI18n,
    bootNotify,
    bootNostrProvider,
    bootPrefetchFeaturedCreators,
    bootFundstrRelay,
    bootE2eTestApi,
  ].filter((entry) => typeof entry === "function");

  let hasRedirected = false;
  const redirect = (url) => {
    hasRedirected = true;

    if (typeof url === "string" && /^https?:\/\//.test(url)) {
      window.location.href = url;
      return;
    }

    void router.push(url).catch((error) => {
      console.error("[boot] redirect navigation error", error);
    });
  };

  const urlPath =
    typeof window !== "undefined"
      ? window.location.href.replace(window.location.origin, "")
      : "/";
  const publicPath = import.meta.env.BASE_URL ?? "/";

  for (const bootFn of bootFiles) {
    if (hasRedirected) {
      break;
    }

    try {
      await bootFn({
        app,
        router,
        store,
        ssrContext: null,
        redirect,
        urlPath,
        publicPath,
      });
    } catch (error) {
      console.error("[boot] error during startup", error);
      return;
    }
  }

  if (hasRedirected) {
    return;
  }

  app.use(router);

  if (import.meta.env.MODE === "pwa") {
    await import("app/src-pwa/register-service-worker");
  }

  await router.isReady();

  app.mount("#q-app");
}

bootstrap().catch((error) => {
  console.error("[main] failed to bootstrap application", error);
});
