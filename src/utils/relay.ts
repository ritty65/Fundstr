export function sanitizeRelayUrls(relays: string[]): string[] {
  return Array.from(
    new Set(
      (Array.isArray(relays) ? relays : [])
        .filter(Boolean)
        .map((u) => String(u).trim().replace(/\/+$/, ""))
        .filter((u) => u.startsWith("ws")),
    ),
  );
}
