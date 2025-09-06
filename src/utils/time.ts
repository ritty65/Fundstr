import type NDK from "@nostr-dev-kit/ndk";

/**
 * Attempt to retrieve a trusted current time from either the NDK pool
 * or from a public time API.
 *
 * @param ndk - An NDK instance whose pool may expose a `now()` method.
 * @param relays - Unused; kept for backward compatibility.
 * @returns A timestamp in milliseconds, or null if none could be fetched.
 */
export async function getTrustedTime(
  ndk: NDK | null,
  _relays: string[],
): Promise<number | null> {
  const pool: any = ndk?.pool as any;
  if (pool && typeof pool.now === "function") {
    try {
      const t = await pool.now();
      if (typeof t === "number" && !Number.isNaN(t)) {
        return t < 1e12 ? t * 1000 : t; // handle seconds
      }
    } catch {
      /* ignore */
    }
  }

  try {
    const res = await fetch(
      "https://worldtimeapi.org/api/timezone/Etc/UTC",
      { cache: "no-cache" },
    );
    const data = await res.json();
    const iso = data.utc_datetime || data.datetime;
    if (iso) {
      const ms = new Date(iso).getTime();
      if (!Number.isNaN(ms)) return ms;
    }
  } catch {
    /* ignore */
  }

  return null;
}

