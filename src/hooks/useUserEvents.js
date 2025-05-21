import { useState, useEffect } from 'react';
import { useNostr, DEFAULT_RELAYS, KIND_CASHU_WALLET, KIND_CASHU_TOKENS } from '../nostr';

export function useUserEvents(type) {
  const {
    nostrUser,
    fetchEventsFromRelay,
    fetchCashuWallet,
    fetchCashuTokens
  } = useNostr();

  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!nostrUser) {
      setEvents([]);
      return;
    }
    (async () => {
      try {
        let evs = [];
        if (type === KIND_CASHU_WALLET) {
          const w = await fetchCashuWallet(nostrUser.pk);
          if (w) evs = [w];
        } else if (type === KIND_CASHU_TOKENS) {
          evs = await fetchCashuTokens(nostrUser.pk);
        } else {
          const res = await fetchEventsFromRelay(
            { authors: [nostrUser.pk], kinds: [type] },
            DEFAULT_RELAYS[0]
          );
          evs = res;
        }
        setEvents(evs);
      } catch {
        setEvents([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nostrUser, type]);

  return [events, setEvents];
}
