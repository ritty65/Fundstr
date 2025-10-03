import { boot } from "quasar/wrappers";
import type { RouteLocationNormalized } from "vue-router";
import {
  isFundstrShareRouteActive,
  setFundstrOnlyRouteOverride,
  syncNdkRelaysWithMode,
} from "boot/ndk";

function routeHasShareMeta(route: RouteLocationNormalized): boolean {
  return route.matched.some((record) => Boolean(record.meta?.nutzapShare));
}

async function applyShareMode(to: RouteLocationNormalized) {
  const shareActive = routeHasShareMeta(to);
  const currentlyActive = isFundstrShareRouteActive();
  if (shareActive === currentlyActive) {
    return;
  }
  setFundstrOnlyRouteOverride(shareActive);
  try {
    await syncNdkRelaysWithMode();
  } catch (err) {
    console.debug("[fundstr-share-route] failed to sync NDK mode", err);
  }
}

export default boot(({ router }) => {
  router.beforeResolve((to, _from, next) => {
    void applyShareMode(to).then(next, next);
  });

  const initialRoute = router.currentRoute.value;
  if (initialRoute) {
    void applyShareMode(initialRoute);
  }
});
