import {
  NUTZAP_RELAY_WSS,
  NUTZAP_RELAY_HTTP,
  NUTZAP_WS_TIMEOUT_MS,
  NUTZAP_HTTP_TIMEOUT_MS,
} from './relayConfig';

const DEFAULT_WS_TIMEOUT_MS = 3000;
const DEFAULT_HTTP_TIMEOUT_MS = 5000;

function stripTrailingSlashes(input: string): string {
  return input.replace(/\/+$/, '');
}

function joinRelayPath(base: string, path: string): string {
  const normalizedBase = stripTrailingSlashes(base || '');
  const normalizedPath = path.replace(/^\/+/, '');
  if (!normalizedBase) {
    return `/${normalizedPath}`;
  }
  return `${normalizedBase}/${normalizedPath}`;
}

function toPositiveNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  const parsed = typeof value === 'string' ? Number(value) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

const FUNDSTR_HTTP_BASE = stripTrailingSlashes(NUTZAP_RELAY_HTTP);

export const FUNDSTR_WS_URL = NUTZAP_RELAY_WSS;
export const FUNDSTR_REQ_URL = joinRelayPath(FUNDSTR_HTTP_BASE, 'req');
export const FUNDSTR_EVT_URL = joinRelayPath(FUNDSTR_HTTP_BASE, 'event');
export const WS_FIRST_TIMEOUT_MS = toPositiveNumber(
  NUTZAP_WS_TIMEOUT_MS,
  DEFAULT_WS_TIMEOUT_MS,
);
export const HTTP_FALLBACK_TIMEOUT_MS = toPositiveNumber(
  NUTZAP_HTTP_TIMEOUT_MS,
  DEFAULT_HTTP_TIMEOUT_MS,
);

export { joinRelayPath, stripTrailingSlashes, toPositiveNumber };
