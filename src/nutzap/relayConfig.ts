function pickRelayEnv(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return fallback;
}

export const NUTZAP_RELAY_WSS = pickRelayEnv(
  import.meta.env.VITE_NUTZAP_PRIMARY_RELAY_WSS,
  'wss://relay.fundstr.me',
);

export const NUTZAP_RELAY_HTTP = pickRelayEnv(
  import.meta.env.VITE_NUTZAP_PRIMARY_RELAY_HTTP,
  'https://relay.fundstr.me',
);

export const NUTZAP_ALLOW_WSS_WRITES =
  (import.meta.env.VITE_NUTZAP_ALLOW_WSS_WRITES ?? 'false') === 'true';

export const NUTZAP_WS_TIMEOUT_MS =
  Number(import.meta.env.VITE_NUTZAP_WS_TIMEOUT_MS ?? 4000);

export const NUTZAP_HTTP_TIMEOUT_MS =
  Number(import.meta.env.VITE_NUTZAP_HTTP_TIMEOUT_MS ?? 5000);

export const NUTZAP_PROFILE_KIND =
  Number(import.meta.env.VITE_NUTZAP_PROFILE_KIND ?? 10019);

export const NUTZAP_TIERS_KIND =
  Number(import.meta.env.VITE_NUTZAP_TIERS_KIND ?? 30019);
