import { describe, it, expect, vi } from "vitest";
import { nip19 } from "nostr-tools";
import { ensureCompressed } from "src/utils/ecash";

const hex = "11".repeat(32);
const npub = nip19.npubEncode(hex);

const event = {
  content: JSON.stringify({
    p2pk: npub,
    mints: ["https://mint"],
  }),
  tags: [["t", "nutzap-profile"], ["client", "fundstr"]],
} as any;

const subMock = {
  on: vi.fn((_evt: string, cb: any) => cb(event)),
  stop: vi.fn(),
};

const storeMock = { initNdkReadOnly: vi.fn() };
vi.mock("stores/nostr", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNostrStore: () => storeMock,
    ensureRelayConnectivity: vi.fn(),
  };
});

vi.mock("src/composables/useNdk", () => ({
  useNdk: vi.fn(async () => ({
    subscribe: vi.fn(() => subMock),
    pool: {
      relays: new Map([
        ['wss://ok', { status: 1, on: vi.fn(), off: vi.fn(), connect: vi.fn().mockResolvedValue(undefined) }]
      ]),
      on: vi.fn(),
    },
    assertSigner: vi.fn(),
    connect: vi.fn(),
  })),
}));

import { fetchNutzapProfile } from "stores/nostr";

describe("fetchNutzapProfile", () => {
  it("returns compressed hex from npub tag", async () => {
    const prof = await fetchNutzapProfile("npub123");
    expect(prof?.p2pkPubkey).toBe(ensureCompressed(hex));
    expect(prof?.p2pkPubkey?.length).toBe(66);
  }, 15000);
});
