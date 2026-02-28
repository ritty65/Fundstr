/* eslint-env serviceworker */

/*
 * This file (which will be your service worker)
 * is picked up by the build system ONLY if
 * quasar.config.js > pwa > workboxMode is set to "injectManifest"
 */

import { clientsClaim } from "workbox-core";
import {
  precacheAndRoute,
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
} from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { NetworkOnly } from "workbox-strategies";

self.skipWaiting();
clientsClaim();

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Use with precache injection
precacheAndRoute(self.__WB_MANIFEST);

cleanupOutdatedCaches();

// Non-SSR fallback to index.html
// Production SSR fallback to offline.html (except for dev)
if (process.env.MODE !== "ssr" || process.env.PROD) {
  registerRoute(
    new NavigationRoute(
      createHandlerBoundToURL(process.env.PWA_FALLBACK_HTML),
      { denylist: [/sw\.js$/, /workbox-(.)*\.js$/] },
    ),
  );
}

const relayMatcher = ({ url }) =>
  url.origin === "https://relay.nostr.band" &&
  (url.pathname.startsWith("/req") || url.pathname.startsWith("/event"));

const discoveryBase =
  (typeof process !== "undefined" &&
    typeof process.env?.VITE_FUNDSTR_API === "string" &&
    process.env.VITE_FUNDSTR_API) ||
  "https://api.fundstr.me";

let discoveryOrigin = "https://api.fundstr.me";
try {
  discoveryOrigin = new URL(discoveryBase).origin;
} catch (error) {
  // keep default
}

const discoveryMatcher = ({ url }) => url.origin === discoveryOrigin;

const networkOnlyNoStore = new NetworkOnly({
  fetchOptions: {
    cache: "no-store",
  },
});

const OFFLINE_RESPONSE_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Fundstr-Offline": "1",
};

const offlineJsonResponse = (message) =>
  new Response(
    JSON.stringify({ offline: true, message }),
    {
      status: 503,
      statusText: "Offline",
      headers: OFFLINE_RESPONSE_HEADERS,
    },
  );

async function broadcastMessageToClients(data) {
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  for (const client of windows) {
    client.postMessage(data);
  }
}

const handleWithOfflineFallback = (matcherName) => async (options) => {
  try {
    return await networkOnlyNoStore.handle(options);
  } catch (error) {
    const target = matcherName === "relay" ? "relay" : "discovery";
    await broadcastMessageToClients({
      type: "NETWORK_REQUIRED",
      payload: {
        target,
        offline: true,
      },
    });

    const message =
      target === "relay"
        ? "Relay access is offline. Sending/receiving requires connectivity."
        : "Creator data could not be refreshed while offline.";

    return offlineJsonResponse(message);
  }
};

registerRoute(relayMatcher, handleWithOfflineFallback("relay"));
registerRoute(discoveryMatcher, handleWithOfflineFallback("discovery"));
