import { boot } from 'quasar/wrappers';
import { ensureFundstrRelayClient } from 'src/nutzap/relayPublishing';
import { NUTZAP_RELAY_WSS } from 'src/nutzap/relayConfig';

export default boot(async () => {
  try {
    const client = await ensureFundstrRelayClient(NUTZAP_RELAY_WSS);
    client.connect();
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[boot/fundstrRelay] failed to preconnect relay', err);
    }
  }
});
