import { route } from "quasar/wrappers";
import {
  createRouter,
  createMemoryHistory,
  createWebHistory,
  createWebHashHistory,
} from "vue-router";
import routes from "./routes";
import { useWelcomeStore } from "src/stores/welcome";
import { useRestoreStore } from "src/stores/restore";

/*
 * If not building with SSR mode, you can
 * directly export the Router instantiation;
 *
 * The function below can be async too; either use
 * async/await or return a Promise which resolves
 * with the Router instance.
 */

export default route(function (/* { store, ssrContext } */) {
  const createHistory = process.env.SERVER
    ? createMemoryHistory
    : process.env.VUE_ROUTER_MODE === "history"
    ? createWebHistory
    : createWebHashHistory;

  const Router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,

    // Leave this as is and make changes in quasar.conf.js instead!
    // quasar.conf.js -> build -> vueRouterMode
    // quasar.conf.js -> build -> publicPath
    history: createHistory(process.env.VUE_ROUTER_BASE),
  });

  Router.beforeEach((to, _from, next) => {
    const welcome = useWelcomeStore();
    const restore = useRestoreStore();

    const isAllowedPublic =
      to.path.startsWith("/welcome") ||
      to.path === "/restore" ||
      to.path === "/terms" ||
      to.path === "/about";

    const env = import.meta.env.VITE_APP_ENV;
    const allow =
      to.query.allow === "1" && (env === "development" || env === "staging");

    if (
      !welcome.welcomeCompleted &&
      !isAllowedPublic &&
      !restore.restoringState
    ) {
      next({
        path: "/welcome",
        query: { redirect: encodeURIComponent(to.fullPath) },
      });
      return;
    }

    if (welcome.welcomeCompleted && to.path.startsWith("/welcome") && !allow) {
      next("/about");
      return;
    }

    next();
  });

  return Router;
});
