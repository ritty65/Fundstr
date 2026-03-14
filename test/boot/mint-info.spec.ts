import { describe, it, expect, vi, afterEach } from "vitest";
import { verifyMint } from "../../src/boot/mint-info";

describe("verifyMint", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns true when nuts supported", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          nuts: {
            "10": { supported: true },
            "11": { supported: true },
            "14": { supported: true },
          },
        }),
      })) as any,
    );
    expect(await verifyMint("https://mint")).toBe(true);
  });

  it("returns false when nuts unsupported", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          nuts: {
            "10": { supported: true },
            "11": { supported: false },
            "14": { supported: true },
          },
        }),
      })) as any,
    );
    expect(await verifyMint("https://mint")).toBe(false);
  });

  it("returns null on network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("fail");
      }) as any,
    );
    expect(await verifyMint("https://mint")).toBeNull();
  });
});
