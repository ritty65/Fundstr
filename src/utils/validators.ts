import { nip19 } from "nostr-tools";

export function isValidNpub(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  try {
    const decoded = nip19.decode(trimmed);
    if (decoded.type !== "npub") {
      throw new Error("Invalid npub prefix");
    }
    return true;
  } catch (e) {
    if (e instanceof Error && e.message === "Invalid npub prefix") {
      throw e;
    }
    return false;
  }
}

export function isValidMintUrl(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  if (/[<>"']/.test(trimmed)) return false;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch (e) {
    return false;
  }

  const isLocalhost =
    url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(isLocalhost && url.protocol === "http:")) {
    return false;
  }

  return true;
}

