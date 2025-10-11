import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FundstrRelayClient,
  type FundstrRelayLogEntry,
} from '../src/nutzap/relayClient';

const originalFetch = globalThis.fetch;

describe('requestOnceViaHttp', () => {
  afterEach(() => {
    if (originalFetch) {
      (globalThis as any).fetch = originalFetch;
    } else {
      delete (globalThis as any).fetch;
    }
    vi.restoreAllMocks();
  });

  it('treats HTML payloads as empty results with a warning', async () => {
    const response = new Response('<html><body>Relay</body></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });

    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);

    const client = new FundstrRelayClient('wss://relay.example');
    const logs: FundstrRelayLogEntry[] = [];
    const stop = client.onLog(entry => {
      logs.push(entry);
    });

    const result = await (client as any).requestOnceViaHttp(
      [{ kinds: [1] }],
      { url: 'https://relay.example/req' },
    );

    expect(result).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      logs.some(
        entry =>
          entry.level === 'warn' &&
          entry.message === 'HTTP fallback returned non-JSON payload',
      ),
    ).toBe(true);

    stop();
    client.clearForTests();
  });
});
