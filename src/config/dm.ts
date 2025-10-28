import { joinRelayPath, stripTrailingSlashes } from "@/nutzap/relayEndpoints";

function parseRelayList(raw: unknown, fallback: string[]): string[] {
  if (typeof raw === "string" && raw.trim()) {
    return raw
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.startsWith("ws"))
      .map((entry) => entry.replace(/\/+$/, ""));
  }
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry) => entry.startsWith("ws"))
      .map((entry) => entry.replace(/\/+$/, ""));
  }
  return [...fallback];
}

function parsePositiveInteger(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return fallback;
}

const DEFAULT_DM_WS = "wss://relay.fundstr.me";
const DEFAULT_DM_HTTP = "https://relay.fundstr.me";

const relayEnv = (import.meta.env.VITE_DM_RELAYS as string | undefined) ?? "";
const httpBaseEnv =
  (import.meta.env.VITE_DM_HTTP_BASE as string | undefined) ?? "";

export const DM_RELAY_ALLOWLIST = parseRelayList(relayEnv, [DEFAULT_DM_WS]);

const httpBase = stripTrailingSlashes(httpBaseEnv || DEFAULT_DM_HTTP);

export const DM_HTTP_BASE = httpBase;
export const DM_HTTP_EVENT_URL = joinRelayPath(httpBase, "event");
export const DM_HTTP_REQ_URL = joinRelayPath(httpBase, "req");

export const DM_WS_ACK_TIMEOUT_MS = parsePositiveInteger(
  import.meta.env.VITE_DM_WS_ACK_TIMEOUT_MS,
  4000,
);

export const DM_HTTP_ACK_TIMEOUT_MS = parsePositiveInteger(
  import.meta.env.VITE_DM_HTTP_ACK_TIMEOUT_MS,
  6000,
);

export const DM_HTTP_POLL_INTERVAL_MS = parsePositiveInteger(
  import.meta.env.VITE_DM_POLL_INTERVAL_MS,
  15000,
);

export const DM_REQUIRE_AUTH =
  ((import.meta.env.VITE_DM_REQUIRE_AUTH as string | undefined) ?? "false").toLowerCase() ===
  "true";

export const DM_AUTH_CACHE_TTL_MS = parsePositiveInteger(
  import.meta.env.VITE_DM_AUTH_TTL_MS,
  5 * 60 * 1000,
);
