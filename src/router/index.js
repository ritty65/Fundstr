import { route } from "quasar/wrappers";
import {
  createRouter,
  createMemoryHistory,
  createWebHistory,
  createWebHashHistory,
} from "vue-router";
import routes from "./routes";
import { hasSeenWelcome } from "src/composables/useWelcomeGate";
import { useRestoreStore } from "src/stores/restore";
import { useNostrStore } from "src/stores/nostr";

/*
 * If not building with SSR mode, you can
 * directly export the Router instantiation;
 *
 * The function below can be async too; either use
 * async/await or return a Promise which resolves
 * with the Router instance.
 */

export default route(async function (/* { store, ssrContext } */) {
  await useNostrStore().loadKeysFromStorage();
  const history = process.env.SERVER
    ? createMemoryHistory(process.env.VUE_ROUTER_BASE)
    : process.env.VUE_ROUTER_MODE === "history"
    ? createWebHistory(import.meta.env.BASE_URL)
    : createWebHashHistory(process.env.VUE_ROUTER_BASE);

  const Router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,

    // Leave this as is and make changes in quasar.config.js instead!
    // quasar.config.js -> build -> vueRouterMode
    // quasar.config.js -> build -> publicPath
    history,
  });

  Router.beforeEach((to, _from, next) => {
    const seen = hasSeenWelcome();
    const isWelcome = to.path.startsWith("/welcome");
    const isPublicProfile =
      to.matched.some((r) => r.name === "PublicCreatorProfile") ||
      to.path.startsWith("/creator/");
    const isPublicDiscover = to.path === "/find-creators";
    const restore = useRestoreStore();

    const env = import.meta.env.VITE_APP_ENV;
    const allow =
      to.query.allow === "1" && (env === "development" || env === "staging");

    if (
      !seen &&
      !isWelcome &&
      !restore.restoringState &&
      to.path !== "/restore" &&
      !isPublicProfile &&
      !isPublicDiscover
    ) {
      next({ path: "/welcome", query: { first: "1" } });
      return;
    }

    if (seen && isWelcome && !allow) {
      next("/about");
      return;
    }

    next();
  });

  return Router;
});
