import { describe, expect, it, vi } from "vitest";
import {
  buildNetworkRequiredNotice,
  notifyNetworkRequired,
} from "src/pwa/networkMessaging";

const noopNotifier = vi.fn();

describe("network messaging helpers", () => {
  it("builds a relay-specific notice", () => {
    const notice = buildNetworkRequiredNotice({ target: "relay" });
    expect(notice.type).toBe("warning");
    expect(notice.message).toContain("relay");
    expect(notice.caption).toContain("connectivity");
  });

  it("falls back to generic messaging for unknown targets", () => {
    const notice = buildNetworkRequiredNotice({ target: "unknown" });
    expect(notice.message).toContain("Network connection");
  });

  it("passes constructed notice to the provided notifier", () => {
    notifyNetworkRequired({ target: "discovery" }, noopNotifier);
    expect(noopNotifier).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Creator"),
        type: "warning",
      }),
    );
  });
});
