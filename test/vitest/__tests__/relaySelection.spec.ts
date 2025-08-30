import { describe, it, beforeEach, expect, vi } from "vitest";
import { selectPreferredRelays, resetRelaySelection } from "../../../src/stores/nostr";
import * as relayHealth from "../../../src/utils/relayHealth";

const filterHealthyRelaysMock = vi.spyOn(relayHealth, "filterHealthyRelays");

describe("selectPreferredRelays", () => {
  beforeEach(() => {
    resetRelaySelection();
    filterHealthyRelaysMock.mockReset();
  });

  it("rotates among healthy relays", async () => {
    filterHealthyRelaysMock.mockResolvedValue(["wss://a", "wss://b"]);
    const first = await selectPreferredRelays(["wss://a", "wss://b"]);
    const second = await selectPreferredRelays(["wss://a", "wss://b"]);
    expect(first).toEqual(["wss://a", "wss://b"]);
    expect(second).toEqual(["wss://b", "wss://a"]);
  });

  it("drops relays that repeatedly fail", async () => {
    filterHealthyRelaysMock.mockResolvedValueOnce([]);
    await selectPreferredRelays(["wss://bad"]);
    filterHealthyRelaysMock.mockResolvedValueOnce([]);
    await selectPreferredRelays(["wss://bad"]);
    filterHealthyRelaysMock.mockResolvedValueOnce([]);
    await selectPreferredRelays(["wss://bad"]);
    filterHealthyRelaysMock.mockResolvedValue(["wss://good"]);
    const res = await selectPreferredRelays(["wss://bad", "wss://good"]);
    expect(res).toEqual(["wss://good"]);
  });
});
