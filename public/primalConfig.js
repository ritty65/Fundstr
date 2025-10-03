const DEFAULT_PROFILE_PROXY = '';
const DEFAULT_MAX_5XX = 2;
const DEFAULT_BACKOFF_MS = 120_000;
const DEFAULT_RESET_MS = 300_000;

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function readJsonConfig() {
  const el = document?.getElementById?.('fundstr-primal-config');
  if (!el) return null;
  try {
    return JSON.parse(el.textContent || '{}');
  } catch (error) {
    console.warn('Failed to parse #fundstr-primal-config', error);
    return null;
  }
}

function readGlobalConfig() {
  if (typeof window === 'undefined') return null;
  return (
    window.__FUNDSTR_PRIMAL__ ||
    window.__FUNDSTR_CONFIG__?.primal ||
    null
  );
}

export function getPrimalProxyConfig() {
  const overrides = Object.assign({}, readJsonConfig() || {}, readGlobalConfig() || {});

  const profileProxy =
    typeof overrides.profileProxy === 'string'
      ? overrides.profileProxy.trim()
      : DEFAULT_PROFILE_PROXY;

  const max5xxBeforeBackoff = parsePositiveInt(
    overrides.max5xxBeforeBackoff,
    DEFAULT_MAX_5XX,
  );
  const backoffMs = parsePositiveInt(overrides.backoffMs, DEFAULT_BACKOFF_MS);
  const resetMs = parsePositiveInt(overrides.resetMs, DEFAULT_RESET_MS);

  return {
    profileProxy,
    max5xxBeforeBackoff,
    backoffMs,
    resetMs,
  };
}
