import { describe, it, expect, vi, beforeEach } from "vitest";

const bootStub = (fn: any) => fn;

describe("boot/nostr-provider", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("leaves window.nostr undefined when no provider is installed", async () => {
    vi.doMock("quasar/wrappers", () => ({ boot: bootStub }));

    const module = await import("src/boot/nostr-provider.ts");

    delete (window as any).nostr;
    await module.default();

    expect((window as any).nostr).toBeUndefined();
  });

  it("preserves existing nostr provider", async () => {
    vi.doMock("quasar/wrappers", () => ({ boot: bootStub }));

    const module = await import("src/boot/nostr-provider.ts");

    const existing = { signEvent: vi.fn() };
    (window as any).nostr = existing;
    await module.default();

    expect((window as any).nostr).toBe(existing);
  });
});
