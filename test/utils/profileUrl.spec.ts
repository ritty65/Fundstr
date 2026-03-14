import { describe, expect, it } from "vitest";

import {
  extractCreatorIdentifier,
  preferredCreatorPublicIdentifier,
} from "src/utils/profileUrl";

describe("extractCreatorIdentifier", () => {
  it("returns raw identifiers unchanged", () => {
    expect(extractCreatorIdentifier("npub1example")).toBe("npub1example");
    expect(extractCreatorIdentifier("f".repeat(64))).toBe("f".repeat(64));
  });

  it("extracts creator identifiers from public profile URLs", () => {
    expect(
      extractCreatorIdentifier(
        "https://fundstr.me/creator/npub1creatorxyz/profile",
      ),
    ).toBe("npub1creatorxyz");
  });

  it("extracts npub query parameters from find creator links", () => {
    expect(
      extractCreatorIdentifier(
        "https://fundstr.me/find-creators?npub=npub1searchtarget",
      ),
    ).toBe("npub1searchtarget");
  });

  it("prefers verified nip05 handles for public creator links", () => {
    expect(
      preferredCreatorPublicIdentifier({
        fallbackIdentifier: "npub1fallback",
        nip05: "alice@fundstr.me",
        nip05Verified: true,
      }),
    ).toBe("alice@fundstr.me");
    expect(
      preferredCreatorPublicIdentifier({
        fallbackIdentifier: "npub1fallback",
        nip05: "alice@fundstr.me",
        nip05Verified: false,
      }),
    ).toBe("npub1fallback");
  });
});
