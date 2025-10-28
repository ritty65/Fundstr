import { FUNDSTR_EVT_URL, FUNDSTR_WS_URL } from "@/nutzap/relayEndpoints";

function parseList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry) => entry.length > 0);
  }
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return [];
}

function toPositiveInteger(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  if (typeof raw === "string") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return fallback;
}

function parseBoolean(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

const metaEnv = (import.meta as any)?.env ?? {};

const envRelays = parseList(metaEnv.VITE_DM_RELAYS);
const envFallbackBase =
  typeof metaEnv.VITE_DM_FALLBACK_BASE === "string"
    ? metaEnv.VITE_DM_FALLBACK_BASE.trim()
    : "";

export const DM_RELAYS = envRelays.length > 0 ? envRelays : [FUNDSTR_WS_URL];

const defaultFallbackBase =
  typeof FUNDSTR_EVT_URL === "string" && FUNDSTR_EVT_URL
    ? FUNDSTR_EVT_URL.replace(/\/event$/i, "")
    : "";
const fallbackBase = envFallbackBase || defaultFallbackBase;

function joinPath(base: string, path: string): string {
  const normalizedBase = base.replace(/\/+$/, "");
  const normalizedPath = path.replace(/^\/+/, "");
  if (!normalizedBase) {
    return `/${normalizedPath}`;
  }
  return `${normalizedBase}/${normalizedPath}`;
}

export const DM_HTTP_EVENT_URL = joinPath(fallbackBase, "event");
export const DM_HTTP_REQ_URL = joinPath(fallbackBase, "req");

export const DM_WS_ACK_TIMEOUT_MS = toPositiveInteger(
  metaEnv.VITE_DM_WS_ACK_TIMEOUT_MS,
  4000,
);

export const DM_HTTP_ACK_TIMEOUT_MS = toPositiveInteger(
  metaEnv.VITE_DM_HTTP_ACK_TIMEOUT_MS,
  8000,
);

export const DM_POLL_INTERVAL_MS = toPositiveInteger(
  metaEnv.VITE_DM_POLL_INTERVAL_MS,
  15000,
);

export const DM_REQUIRE_AUTH = parseBoolean(
  metaEnv.VITE_DM_REQUIRE_AUTH,
  false,
);

export const DM_AUTH_CACHE_MS = toPositiveInteger(
  metaEnv.VITE_DM_AUTH_CACHE_MS,
  5 * 60 * 1000,
);

export type DmTransportMode = "ws" | "http" | "offline";
export type DmSignerMode = "extension" | "software" | "none";
