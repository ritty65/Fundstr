import { describe, expect, it } from 'vitest';
import { ensureFundstrRelayClient } from 'src/nutzap/relayPublishing';
import { fundstrRelayClient } from 'src/nutzap/relayClient';

describe('ensureFundstrRelayClient', () => {
  it('returns the shared FundstrRelayClient instance', async () => {
    const client = await ensureFundstrRelayClient();
    const second = await ensureFundstrRelayClient();
    expect(client).toBe(fundstrRelayClient);
    expect(second).toBe(fundstrRelayClient);
  });
});
