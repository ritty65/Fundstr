import { describe, expect, it, vi, beforeEach } from "vitest";
import { nip19 } from "nostr-tools";

import {
  searchDmSuggestions,
  isValidDmPubkeyInput,
  type DmSuggestion,
} from "src/utils/dmSuggestions";
import type { PhonebookProfile } from "src/api/phonebook";

const findProfilesMock = vi.hoisted(() => vi.fn());

vi.mock("src/api/phonebook", () => ({
  findProfiles: findProfilesMock,
}));

describe("searchDmSuggestions", () => {
  beforeEach(() => {
    findProfilesMock.mockReset();
  });

  it("returns mapped suggestions from phonebook", async () => {
    const profile: PhonebookProfile = {
      pubkey: "a".repeat(64),
      display_name: "Jack D",
      name: "jack",
      about: null,
      picture: "https://example.com/pic.jpg",
      nip05: "jack@example.com",
    };
    findProfilesMock.mockResolvedValue({ query: "jack", results: [profile], count: 1 });

    const suggestions = await searchDmSuggestions("jack");

    expect(findProfilesMock).toHaveBeenCalledWith("jack", undefined);
    expect(suggestions).toHaveLength(1);
    const [first] = suggestions as [DmSuggestion];
    expect(first.pubkey).toBe(profile.pubkey);
    expect(first.npub).toBe(nip19.npubEncode(profile.pubkey));
    expect(first.label).toBe("Jack D");
    expect(first.picture).toBe(profile.picture);
    expect(first.nip05).toBe(profile.nip05);
    expect(first.raw).toEqual(profile);
  });

  it("skips lookup for npub or hex inputs", async () => {
    const hex = "b".repeat(64);
    const npub = nip19.npubEncode(hex);
    const hexResult = await searchDmSuggestions(hex);
    const npubResult = await searchDmSuggestions(npub);

    expect(hexResult).toEqual([]);
    expect(npubResult).toEqual([]);
    expect(findProfilesMock).not.toHaveBeenCalled();
  });

  it("falls back to shortened npub when no label fields", async () => {
    const pubkey = "c".repeat(64);
    const profile: PhonebookProfile = {
      pubkey,
      display_name: null,
      name: null,
      about: null,
      picture: null,
      nip05: null,
    };
    findProfilesMock.mockResolvedValue({ query: "anon", results: [profile], count: 1 });

    const [suggestion] = await searchDmSuggestions("anon");

    expect(suggestion.label.startsWith(nip19.npubEncode(pubkey).slice(0, 6))).toBe(true);
  });

  it("returns empty on lookup failure", async () => {
    findProfilesMock.mockRejectedValue(new Error("boom"));

    const results = await searchDmSuggestions("errorcase");

    expect(results).toEqual([]);
  });
});

describe("isValidDmPubkeyInput", () => {
  it("validates hex and npub values", () => {
    const hex = "d".repeat(64);
    const npub = nip19.npubEncode(hex);

    expect(isValidDmPubkeyInput(hex)).toBe(true);
    expect(isValidDmPubkeyInput(npub)).toBe(true);
    expect(isValidDmPubkeyInput("notvalid")).toBe(false);
  });
});
