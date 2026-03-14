import { describe, it, expect } from "vitest";
import { nip19 } from "nostr-tools";

import { deriveCreatorKeys } from "src/utils/nostrKeys";

describe("deriveCreatorKeys", () => {
  it("returns canonical hex when given an npub", () => {
    const hex = "f".repeat(64);
    const npub = nip19.npubEncode(hex);

    const result = deriveCreatorKeys(npub);

    expect(result.hex).toBe(hex);
    expect(result.npub).toBe(npub);
  });

  it("produces an npub when given a raw hex key", () => {
    const hex = "a".repeat(64);

    const result = deriveCreatorKeys(hex);

    expect(result.hex).toBe(hex);
    expect(result.npub).toBe(nip19.npubEncode(hex));
  });

  it("throws when given invalid input", () => {
    expect(() => deriveCreatorKeys("not-a-key")).toThrowError();
    expect(() => deriveCreatorKeys(undefined)).toThrowError();
    expect(() => deriveCreatorKeys("")).toThrowError();
  });
});
