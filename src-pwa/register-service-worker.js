/* eslint-disable no-console */
import { register } from "register-service-worker";
import { Notify } from "quasar";
import { notifyNetworkRequired } from "../src/pwa/networkMessaging";
import {
  isNewerLiveDeploy,
  isSensitiveUpdatePath,
  parseDeployMarker,
} from "../src/pwa/updateLifecycle";

if (import.meta.env.PROD) {
  const rawBase =
    typeof import.meta.env.BASE_URL === "string" && import.meta.env.BASE_URL
      ? import.meta.env.BASE_URL
      : "/";
  const normalizedBase = rawBase === "./" ? "/" : rawBase;
  const base = new URL(normalizedBase, window.location.origin);
  const buildId =
    typeof import.meta.env.VITE_BUILD_ID === "string"
      ? import.meta.env.VITE_BUILD_ID.trim()
      : "";
  const swUrl = new URL(
    buildId ? `sw.js?v=${encodeURIComponent(buildId)}` : "sw.js",
    base,
  ).toString();
  const deployMarkerUrl = new URL("deploy.txt", base).toString();
  const reloadGuardKey = "fundstr.pwa.lastUpdateReloadAt";
  const liveDeployCheckIntervalMs = 10 * 60 * 1000;
  let liveDeployCheckInFlight = false;
  let pendingLiveDeploySha = null;
  let dismissUpdateNotice = null;
  let lastNotifiedDeploySha = null;

  const shouldReloadForUpdate = () => {
    try {
      const previousReloadAt = Number(
        window.sessionStorage.getItem(reloadGuardKey) || 0,
      );
      const now = Date.now();

      if (Number.isFinite(previousReloadAt) && now - previousReloadAt < 15000) {
        console.warn("[PWA] skipping repeat reload after recent update");
        return false;
      }

      window.sessionStorage.setItem(reloadGuardKey, String(now));
    } catch (error) {
      // ignore sessionStorage failures and allow reload
    }

    return true;
  };

  const dismissPendingUpdateNotice = () => {
    if (typeof dismissUpdateNotice === "function") {
      dismissUpdateNotice();
      dismissUpdateNotice = null;
    }
  };

  const reloadToLatestVersion = (registration) => {
    const safeReload = () => {
      dismissPendingUpdateNotice();
      if (shouldReloadForUpdate()) {
        window.location.reload();
      }
    };

    if (registration && registration.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
      safeReload();
      return;
    }

    Promise.resolve(registration?.update?.())
      .catch(() => {})
      .finally(safeReload);
  };

  const showDeferredUpdateNotice = (registration, liveDeploySha) => {
    if (
      liveDeploySha &&
      lastNotifiedDeploySha === liveDeploySha &&
      typeof dismissUpdateNotice === "function"
    ) {
      return;
    }

    dismissPendingUpdateNotice();
    lastNotifiedDeploySha = liveDeploySha || null;

    try {
      dismissUpdateNotice = Notify.create({
        message:
          "A newer version of Fundstr is ready. Refresh after you finish this wallet or messaging flow.",
        caption: liveDeploySha
          ? `Live deploy ${liveDeploySha.slice(0, 7)} is available.`
          : "Refresh when you are ready for the latest fixes.",
        type: "warning",
        timeout: 0,
        position: "top",
        multiLine: true,
        actions: [
          {
            label: "Refresh now",
            color: "white",
            handler: () => reloadToLatestVersion(registration),
          },
          {
            label: "Later",
            color: "white",
          },
        ],
      });
    } catch (error) {
      console.warn("[PWA] failed to show deferred update notice", error);
    }
  };

  const maybeHandleLiveDeploy = (registration, liveDeploySha) => {
    if (!isNewerLiveDeploy(buildId, liveDeploySha)) {
      return;
    }

    pendingLiveDeploySha = liveDeploySha;
    registration.update().catch(() => {});

    if (isSensitiveUpdatePath(window.location.pathname)) {
      showDeferredUpdateNotice(registration, liveDeploySha);
    }
  };

  const checkLiveDeployMarker = async (registration) => {
    if (!registration || !buildId || liveDeployCheckInFlight) {
      return;
    }

    liveDeployCheckInFlight = true;
    try {
      const response = await fetch(deployMarkerUrl, {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) {
        return;
      }

      const marker = parseDeployMarker(await response.text());
      maybeHandleLiveDeploy(registration, marker?.sha || "");
    } catch (error) {
      console.warn("[PWA] failed to check live deploy marker", error);
    } finally {
      liveDeployCheckInFlight = false;
    }
  };

  register(swUrl, {
    registrationOptions: { scope: base.pathname },
    ready() {
      console.log("[PWA] ready");
    },
    registered() {
      console.log("[PWA] registered", swUrl);
    },
    cached() {
      console.log("[PWA] cached");
    },
    updatefound() {
      console.log("[PWA] update found");
    },
    updated(reg) {
      console.log("[PWA] updated, handling latest version");

      if (isSensitiveUpdatePath(window.location.pathname)) {
        showDeferredUpdateNotice(reg, pendingLiveDeploySha || "");
        return;
      }

      dismissPendingUpdateNotice();
      if (reg && reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
      try {
        Notify.create({
          message: "Fundstr updated. Reloading for the latest fixes…",
          type: "positive",
          timeout: 2000,
          position: "top",
        });
      } catch (error) {
        // ignore
      }
      if (shouldReloadForUpdate()) {
        window.location.reload();
      }
    },
    offline() {
      console.log("[PWA] offline");
    },
    error(e) {
      console.error("[PWA] registration error", e);
    },
  });

  navigator.serviceWorker.addEventListener("message", (event) => {
    const { type, payload } = event.data || {};
    if (type === "NETWORK_REQUIRED") {
      try {
        notifyNetworkRequired(payload || {}, (options) =>
          Notify.create(options),
        );
      } catch (error) {
        console.warn("[PWA] failed to surface offline warning", error);
      }
    }
  });

  const ensureUpdates = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const triggerUpdate = () => registration.update().catch(() => {});
      const triggerDeployCheck = () => checkLiveDeployMarker(registration);
      triggerUpdate();
      void triggerDeployCheck();
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          triggerUpdate();
          void triggerDeployCheck();
        }
      });
      setInterval(triggerUpdate, 60 * 60 * 1000);
      setInterval(() => {
        void triggerDeployCheck();
      }, liveDeployCheckIntervalMs);
    } catch (error) {
      console.warn("[PWA] failed to schedule SW updates", error);
    }
  };

  ensureUpdates().catch(() => {});
}
