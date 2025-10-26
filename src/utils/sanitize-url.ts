export function isTrustedUrl(url: string): boolean {
  try {
    const base =
      typeof window !== "undefined" && window.location
        ? window.location.origin
        : "https://fundstr.test";
    const parsed = new URL(url, base);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}
