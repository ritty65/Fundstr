import { describe, expect, it } from "vitest";

import {
  describeMintPaymentCapabilities,
  summarizeMintPaymentCapabilities,
} from "src/utils/paymentCapabilities";

describe("payment capability helpers", () => {
  it("marks split-capable mints as fully ready", () => {
    const capability = describeMintPaymentCapabilities({
      nuts: {
        4: { methods: [], disabled: false },
        10: { supported: true },
        11: { supported: true },
        14: { supported: true },
      },
    });

    expect(capability.capability).toBe("split");
    expect(capability.label).toBe("Split-capable");
    expect(capability.rows.every((row) => row.status === "supported")).toBe(
      true,
    );
  });

  it("marks non-splitting mints as exact-match only", () => {
    const capability = describeMintPaymentCapabilities({
      nuts: {
        10: { supported: true },
        11: { supported: true },
        14: { supported: true },
      },
    });

    expect(capability.capability).toBe("exact");
    expect(capability.label).toBe("Exact-match only");
    expect(
      capability.rows.find((row) => row.key === "oneTimeExact")?.status,
    ).toBe("supported");
    expect(
      capability.rows.find((row) => row.key === "subscription")?.status,
    ).toBe("unsupported");
  });

  it("summarizes mixed mint coverage into a capability matrix", () => {
    const summary = summarizeMintPaymentCapabilities([
      describeMintPaymentCapabilities({
        nuts: {
          4: { methods: [], disabled: false },
          10: { supported: true },
          11: { supported: true },
          14: { supported: true },
        },
      }),
      describeMintPaymentCapabilities({
        nuts: {
          10: { supported: true },
          11: { supported: true },
          14: { supported: true },
        },
      }),
    ]);

    expect(summary).not.toBeNull();
    expect(summary?.label).toBe("1/2 mints split-ready");
    expect(
      summary?.rows.find((row) => row.key === "oneTimeExact")?.status,
    ).toBe("supported");
    expect(
      summary?.rows.find((row) => row.key === "oneTimeFlexible")?.status,
    ).toBe("mixed");
    expect(
      summary?.rows.find((row) => row.key === "subscription")?.status,
    ).toBe("mixed");
  });

  it("flags unknown mint info for manual review", () => {
    const summary = summarizeMintPaymentCapabilities([
      describeMintPaymentCapabilities(null),
    ]);

    expect(summary?.label).toBe("Capability needs review");
    expect(summary?.rows.every((row) => row.status === "unknown")).toBe(true);
  });
});
