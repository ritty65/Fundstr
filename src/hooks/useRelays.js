import { useState, useEffect } from 'react';

export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net'
];

export function saveRelays(relays) {
  localStorage.setItem('nostr_relays', JSON.stringify(relays));
}

export function loadRelays() {
  try {
    const r = JSON.parse(localStorage.getItem('nostr_relays'));
    if (Array.isArray(r) && r.length) return r;
  } catch {}
  return DEFAULT_RELAYS;
}

export async function checkRelayStatuses(relays) {
  const statuses = {};
  await Promise.all(
    relays.map(relayUrl =>
      new Promise(resolve => {
        try {
          const ws = new window.WebSocket(relayUrl);
          let settled = false;
          ws.onopen = () => {
            statuses[relayUrl] = 'online';
            settled = true;
            ws.close();
            resolve();
          };
          ws.onerror = () => {
            statuses[relayUrl] = 'error';
            settled = true;
            ws.close();
            resolve();
          };
          ws.onclose = () => {
            if (!settled) {
              statuses[relayUrl] = 'error';
              resolve();
            }
          };
          setTimeout(() => {
            if (!settled) {
              statuses[relayUrl] = 'error';
              ws.close();
              resolve();
            }
          }, 1500);
        } catch {
          statuses[relayUrl] = 'error';
          resolve();
        }
      })
    )
  );
  return statuses;
}

export function useRelays(defaultRelays = DEFAULT_RELAYS) {
  const [relays, setRelays] = useState(loadRelays() || defaultRelays);
  const [relayStatus, setRelayStatus] = useState({});

  useEffect(() => {
    saveRelays(relays);
    (async () => setRelayStatus(await checkRelayStatuses(relays)))();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relays]);

  function addRelay(relay) {
    if (relays.includes(relay)) return;
    setRelays([...relays, relay]);
  }

  function removeRelay(relay) {
    setRelays(relays.filter(r => r !== relay));
  }

  return { relays, relayStatus, addRelay, removeRelay };
}
