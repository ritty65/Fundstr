import { describe, expect, it } from 'vitest';
import { ensureFundstrRelayClient } from 'src/pages/nutzap-profile/nostrHelpers';
import { fundstrRelayClient } from 'src/nutzap/relayClient';

describe('ensureFundstrRelayClient', () => {
  it('returns the shared FundstrRelayClient instance', async () => {
    const client = await ensureFundstrRelayClient();
    const second = await ensureFundstrRelayClient();
    expect(client).toBe(fundstrRelayClient);
    expect(second).toBe(fundstrRelayClient);
  });
});
