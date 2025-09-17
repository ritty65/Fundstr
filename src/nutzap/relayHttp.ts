import { NUTZAP_RELAY_HTTP, NUTZAP_HTTP_TIMEOUT_MS } from './relayConfig';

function withTimeout<T>(p: Promise<T>, ms: number) {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('http-timeout')), ms);
    p.then(
      v => {
        clearTimeout(t);
        resolve(v);
      },
      e => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/** POST a raw nostr event (NIP-01 JSON) to /event; expect { ok, relay, msg? } */
export async function httpPublish(rawEvent: any) {
  const res = await withTimeout(
    fetch(`${NUTZAP_RELAY_HTTP}/event`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(rawEvent),
    }),
    NUTZAP_HTTP_TIMEOUT_MS
  );
  return res.json();
}

/** GET events via /req?filters=[...] ; expect { ok:true, events:[...] } */
export async function httpReq(filters: any[]) {
  const qs = new URLSearchParams({ filters: JSON.stringify(filters) });
  const res = await withTimeout(
    fetch(`${NUTZAP_RELAY_HTTP}/req?${qs.toString()}`),
    NUTZAP_HTTP_TIMEOUT_MS
  );
  return res.json();
}
