/* eslint-disable no-console */
import { register } from "register-service-worker";
import { Notify } from "quasar";
import { notifyNetworkRequired } from "../src/pwa/networkMessaging";

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
  const reloadGuardKey = "fundstr.pwa.lastUpdateReloadAt";

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
      console.log("[PWA] updated, forcing activation");
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
      triggerUpdate();
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          triggerUpdate();
        }
      });
      setInterval(triggerUpdate, 60 * 60 * 1000);
    } catch (error) {
      console.warn("[PWA] failed to schedule SW updates", error);
    }
  };

  ensureUpdates().catch(() => {});
}
