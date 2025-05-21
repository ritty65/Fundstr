import { useState } from 'react';

export function loadNwc() {
  try {
    return JSON.parse(localStorage.getItem('nwc_conn'));
  } catch {
    return null;
  }
}

function saveNwc(conn) {
  if (conn) localStorage.setItem('nwc_conn', JSON.stringify(conn));
  else localStorage.removeItem('nwc_conn');
}

function parseNwcUri(uri) {
  try {
    if (!uri.startsWith('nostr+walletconnect://')) return null;
    const stripped = uri.replace('nostr+walletconnect://', 'https://');
    const u = new URL(stripped);
    return {
      walletPubkey: u.hostname,
      relays: u.searchParams.getAll('relay'),
      secret: u.searchParams.get('secret')
    };
  } catch {
    return null;
  }
}

export function useWalletConnect(relays = []) {
  const [nwc, setNwc] = useState(loadNwc());

  function connectNwc(uri) {
    const conn = parseNwcUri(uri);
    if (conn && conn.secret && conn.walletPubkey) {
      setNwc(conn);
      saveNwc(conn);
      return true;
    }
    return false;
  }

  function disconnectNwc() {
    setNwc(null);
    saveNwc(null);
  }

  async function sendNwcPayInvoice(invoice, amount) {
    if (!nwc) throw new Error('No NWC connection');
    const event = {
      kind: 23194,
      pubkey: window.NostrTools.getPublicKey(nwc.secret),
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', nwc.walletPubkey]],
      content: await window.NostrTools.nip04.encrypt(
        nwc.secret,
        nwc.walletPubkey,
        JSON.stringify({ method: 'pay_invoice', params: { invoice, amount } })
      )
    };
    const signed = window.NostrTools.signEvent(event, nwc.secret);
    await Promise.all(
      (nwc.relays.length ? nwc.relays : relays).map(relayUrl =>
        new Promise(resolve => {
          try {
            const ws = new window.WebSocket(relayUrl);
            ws.onopen = () => {
              ws.send(JSON.stringify(['EVENT', signed]));
              setTimeout(() => ws.close(), 1000);
            };
            ws.onerror = () => {
              ws.close();
              resolve();
            };
            ws.onclose = () => resolve();
          } catch {
            resolve();
          }
        })
      )
    );
  }

  return { nwc, connectNwc, disconnectNwc, sendNwcPayInvoice };
}
