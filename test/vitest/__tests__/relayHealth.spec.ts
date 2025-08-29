import { describe, it, expect, vi } from "vitest";
import { pingRelay } from "../../../src/utils/relayHealth";

class FailingWS {
  static count = 0;
  static CONNECTING = 0;
  static OPEN = 1;
  readyState = FailingWS.CONNECTING;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((ev: any) => void) | null = null;
  constructor(url: string) {
    FailingWS.count++;
    setTimeout(() => {
      this.onerror && this.onerror();
    }, 0);
  }
  close() {}
}

describe("pingRelay cache", () => {
  it("reuses cached failure", async () => {
    // @ts-ignore
    const OriginalWS = globalThis.WebSocket;
    // @ts-ignore
    globalThis.WebSocket = FailingWS;
    vi.useFakeTimers();
    const p1 = pingRelay("wss://bad");
    await vi.runAllTimersAsync();
    const r1 = await p1;
    const r2 = await pingRelay("wss://bad");
    expect(r1).toBe(false);
    expect(r2).toBe(false);
    expect(FailingWS.count).toBe(3);
    vi.useRealTimers();
    // @ts-ignore
    globalThis.WebSocket = OriginalWS;
  });
});

