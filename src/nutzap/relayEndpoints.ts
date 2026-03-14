import {
  NUTZAP_RELAY_WSS,
  NUTZAP_RELAY_HTTP,
  NUTZAP_WS_TIMEOUT_MS,
  NUTZAP_HTTP_TIMEOUT_MS,
} from './relayConfig';

const DEFAULT_WS_TIMEOUT_MS = 3000;
const DEFAULT_HTTP_TIMEOUT_MS = 8000;

function sanitizeHttpBase(raw: string): string {
  const trimmed = stripTrailingSlashes(raw || '');
  if (!trimmed) {
    return '';
  }

  let normalized = trimmed;
  const strippedSegments: string[] = [];

  while (true) {
    const lower = normalized.toLowerCase();
    if (lower.endsWith('/req')) {
      strippedSegments.push('/req');
      normalized = stripTrailingSlashes(normalized.slice(0, -4));
      continue;
    }
    if (lower.endsWith('/event')) {
      strippedSegments.push('/event');
      normalized = stripTrailingSlashes(normalized.slice(0, -6));
      continue;
    }
    break;
  }

  if (strippedSegments.length > 0) {
    const uniqueSegments = Array.from(new Set(strippedSegments));
    const plural = uniqueSegments.length > 1 ? 'segments' : 'segment';
    console.warn(
      `[Nutzap] NUTZAP_RELAY_HTTP should not include ${uniqueSegments.join(
        ' or '
      )}. Stripping ${plural} to avoid duplicate paths.`
    );
  }

  return normalized;
}

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

const FUNDSTR_HTTP_BASE = sanitizeHttpBase(NUTZAP_RELAY_HTTP);

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
