import type NDK from "@nostr-dev-kit/ndk";

/**
 * Attempt to retrieve a trusted current time from either the NDK pool
 * or via a simple HEAD request to one of the provided relay URLs.
 *
 * @param ndk - An NDK instance whose pool may expose a `now()` method.
 * @param relays - Relay URLs used as fallback HTTP HEAD targets.
 * @returns A timestamp in milliseconds, or null if none could be fetched.
 */
export async function getTrustedTime(
  ndk: NDK | null,
  relays: string[],
): Promise<number | null> {
  const pool: any = ndk?.pool as any;
  if (pool && typeof pool.now === "function") {
    try {
      const t = await pool.now();
      if (typeof t === "number" && !Number.isNaN(t)) {
        return t < 1e12 ? t * 1000 : t; // handle seconds
      }
    } catch {
      // ignore and fallback
    }
  }

  for (const r of relays) {
    try {
      const httpUrl = r.replace(/^wss?:\/\//, "https://");
      const res = await fetch(httpUrl, { method: "HEAD" });
      const header = res.headers.get("date");
      if (header) {
        const ms = new Date(header).getTime();
        if (!Number.isNaN(ms)) return ms;
      }
    } catch {
      // try next relay
    }
  }

  return null;
}

