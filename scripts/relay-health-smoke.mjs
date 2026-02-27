#!/usr/bin/env node

import { setTimeout as delay } from "node:timers/promises";
import WebSocket from "ws";

const relayHttpBase = process.env.RELAY_HTTP_BASE ?? "https://relay.fundstr.me";
const relayWsUrl = process.env.RELAY_WS_URL ?? "wss://relay.fundstr.me";
const timeoutMs = Number(process.env.RELAY_HEALTH_TIMEOUT_MS ?? 5000);

const impossibleAuthor = "0".repeat(64);
const filters = [
  {
    kinds: [10019],
    authors: [impossibleAuthor],
    limit: 1,
  },
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      signal: controller.signal,
      method: "GET",
      headers: {
        accept: "application/json",
      },
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

async function checkHttpRelay() {
  const reqUrl = `${relayHttpBase}/req?filters=${encodeURIComponent(
    JSON.stringify(filters),
  )}`;
  const res = await fetchWithTimeout(reqUrl, timeoutMs);
  assert(res.ok, `Relay HTTP query failed: ${res.status} ${res.statusText}`);

  const body = await res.json();
  const events = Array.isArray(body)
    ? body
    : body && Array.isArray(body.events)
    ? body.events
    : null;
  assert(Array.isArray(events), "Relay HTTP query returned non-array payload");

  console.log(`Relay HTTP OK (${events.length} event(s))`);
}

async function checkWsRelay() {
  const subId = `health-${Math.random().toString(36).slice(2, 10)}`;

  await new Promise((resolve, reject) => {
    const ws = new WebSocket(relayWsUrl);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error(`Relay WS timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    let settled = false;
    const finish = (fn, payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // noop
      }
      fn(payload);
    };

    ws.on("open", () => {
      ws.send(JSON.stringify(["REQ", subId, ...filters]));
    });

    ws.on("message", (raw) => {
      let payload;
      try {
        payload = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!Array.isArray(payload) || payload.length === 0) return;

      const [type, sub] = payload;
      if (typeof sub === "string" && sub !== subId) return;

      if (type === "EOSE") {
        finish(resolve);
      }
      if (type === "CLOSED") {
        finish(
          reject,
          new Error(`Relay WS closed subscription: ${payload[2] || "unknown"}`),
        );
      }
    });

    ws.on("error", (err) => {
      finish(reject, err);
    });

    ws.on("close", () => {
      if (!settled) {
        finish(reject, new Error("Relay WS closed before EOSE"));
      }
    });
  });

  console.log("Relay WS OK (EOSE received)");
}

async function main() {
  console.log(
    `Running relay health checks against ${relayHttpBase} / ${relayWsUrl}`,
  );
  await checkHttpRelay();
  await checkWsRelay();

  const optionalRelayCsv = process.env.RELAY_OPTIONAL_WS_RELAYS ?? "";
  const optionalRelays = optionalRelayCsv
    .split(",")
    .map((url) => url.trim())
    .filter((url) => url.length > 0);

  if (optionalRelays.length > 0) {
    console.log(`Checking ${optionalRelays.length} optional fallback relay(s)`);
    for (const relayUrl of optionalRelays) {
      try {
        await Promise.race([
          new Promise((resolve, reject) => {
            const ws = new WebSocket(relayUrl);
            const timer = setTimeout(() => {
              ws.terminate();
              reject(new Error("timeout"));
            }, timeoutMs);

            ws.on("open", () => {
              clearTimeout(timer);
              ws.close();
              resolve(undefined);
            });

            ws.on("error", (err) => {
              clearTimeout(timer);
              reject(err);
            });

            ws.on("close", () => {
              clearTimeout(timer);
            });
          }),
          delay(timeoutMs + 100).then(() => {
            throw new Error("timeout");
          }),
        ]);
        console.log(`Optional relay OK: ${relayUrl}`);
      } catch (err) {
        console.warn(`Optional relay warning (${relayUrl}): ${String(err)}`);
      }
    }
  }

  console.log("Relay health smoke checks OK");
}

main().catch((err) => {
  console.error("Relay health smoke checks failed:", err);
  process.exit(1);
});
