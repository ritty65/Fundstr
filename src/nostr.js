import React, { useState, useEffect, createContext, useContext } from 'react';

export const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net"
];
export const KIND_PROFILE = 0;
export const KIND_MVP_TIER = 30078;
export const KIND_MVP_PLEDGE = 30079;
export const KIND_RECURRING_PLEDGE = 30080;

const NostrContext = createContext();

export function useNostr() {
  return useContext(NostrContext);
}

export function npubEncode(pk) {
  return window.NostrTools.nip19.npubEncode(pk);
}
function saveRelays(relays) {
  localStorage.setItem("nostr_relays", JSON.stringify(relays));
}
function loadRelays() {
  try {
    const r = JSON.parse(localStorage.getItem("nostr_relays"));
    if (Array.isArray(r) && r.length) return r;
  } catch {}
  return DEFAULT_RELAYS;
}

export function NostrProvider({ children }) {
  const [nostrUser, setNostrUser] = useState(null);
  const [relays, setRelays] = useState(loadRelays());
  const [relayStatus, setRelayStatus] = useState({});
  const [error, setError] = useState(null);
  const [hasNip07, setHasNip07] = useState(false);

  useEffect(() => {
    if (window.nostr && window.nostr.getPublicKey && window.nostr.signEvent) {
      setHasNip07(true);
    }
  }, []);

  useEffect(() => {
    saveRelays(relays);
    checkRelayStatuses(relays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relays]);

  async function checkRelayStatuses(relays) {
    const statuses = {};
    await Promise.all(relays.map(relayUrl =>
      new Promise(resolve => {
        try {
          const ws = new window.WebSocket(relayUrl);
          let settled = false;
          ws.onopen = () => { statuses[relayUrl] = "online"; settled = true; ws.close(); resolve(); };
          ws.onerror = () => { statuses[relayUrl] = "error"; settled = true; ws.close(); resolve(); };
          ws.onclose = () => { if (!settled) { statuses[relayUrl] = "error"; resolve(); } };
          setTimeout(() => { if (!settled) { statuses[relayUrl] = "error"; ws.close(); resolve(); } }, 1500);
        } catch { statuses[relayUrl] = "error"; resolve(); }
      })
    ));
    setRelayStatus(statuses);
  }

  function addRelay(relay) {
    if (relays.includes(relay)) return;
    setRelays([...relays, relay]);
  }
  function removeRelay(relay) {
    setRelays(relays.filter(r => r !== relay));
  }

  async function loginWithExtension() {
    if (!hasNip07) return;
    try {
      const pk = await window.nostr.getPublicKey();
      setNostrUser({ pk, npub: npubEncode(pk) });
      setError(null);
    } catch (e) {
      setError("Failed to get public key: " + e.message);
    }
  }

  function logout() {
    setNostrUser(null);
    setError(null);
  }

  async function publishNostrEvent(eventTemplate) {
    if (!nostrUser) throw new Error("Connect your Nostr extension first!");
    if (!hasNip07) throw new Error("NIP-07 extension not available");
    try {
      const template = {
        ...eventTemplate,
        pubkey: nostrUser.pk,
        created_at: Math.floor(Date.now() / 1000)
      };
      const signed = await window.nostr.signEvent(template);

      let errors = [];
      let successes = 0;
      await Promise.all(relays.map(relayUrl =>
        new Promise(resolve => {
          try {
            const ws = new window.WebSocket(relayUrl);
            let isHandled = false;
            ws.onopen = () => {
              ws.send(JSON.stringify(["EVENT", signed]));
              setTimeout(() => { if (!isHandled) ws.close(); }, 1000);
            };
            ws.onerror = () => { errors.push(relayUrl); ws.close(); resolve(); };
            ws.onclose = () => resolve();
            ws.onmessage = () => { isHandled = true; successes += 1; ws.close(); resolve(); };
          } catch (e) { errors.push(relayUrl); resolve(); }
        })
      ));
      if (successes === 0) throw new Error(errors.join("; "));
      setError(null);
      return signed;
    } catch (err) {
      setError("Publish failed: " + err.message);
      throw err;
    }
  }

  async function fetchLatestEvent(pubkey, kind, relayUrl) {
    return new Promise((resolve) => {
      try {
        const ws = new window.WebSocket(relayUrl);
        const subId = Math.random().toString(36).slice(2);
        ws.onopen = () => {
          ws.send(JSON.stringify([
            "REQ", subId,
            { authors: [pubkey], kinds: [kind], limit: 1 }
          ]));
        };
        ws.onmessage = e => {
          const data = JSON.parse(e.data);
          if (data[0] === "EVENT" && data[1] === subId) {
            ws.close();
            resolve(data[2]);
          }
          if (data[0] === "EOSE" && data[1] === subId) {
            ws.close();
            resolve(null);
          }
        };
        ws.onerror = () => { ws.close(); resolve(null); };
      } catch { resolve(null); }
    });
  }
  async function fetchEventsFromRelay(filter, relayUrl) {
    return new Promise((resolve) => {
      try {
        const ws = new window.WebSocket(relayUrl);
        const subId = Math.random().toString(36).slice(2);
        const events = [];
        ws.onopen = () => { ws.send(JSON.stringify(["REQ", subId, filter])); };
        ws.onmessage = e => {
          const data = JSON.parse(e.data);
          if (data[0] === "EVENT" && data[1] === subId) { events.push(data[2]); }
          if (data[0] === "EOSE" && data[1] === subId) { ws.close(); resolve(events); }
        };
        ws.onerror = () => { ws.close(); resolve(events); };
      } catch { resolve([]); }
    });
  }

  // Profile functions
  async function publishProfile(profile) {
    if (!nostrUser) throw new Error("Connect your Nostr extension first!");
    return await publishNostrEvent({
      kind: KIND_PROFILE,
      tags: [],
      content: JSON.stringify(profile)
    });
  }
  async function fetchProfile(pubkey) {
    for (const relay of relays) {
      const event = await fetchLatestEvent(pubkey, KIND_PROFILE, relay);
      if (event) {
        try { return JSON.parse(event.content); } catch { return {}; }
      }
    }
    return {};
  }

  // --- NIP-47 wallet connect helpers ---
  function loadNwc() {
    try { return JSON.parse(localStorage.getItem("nwc_conn")); } catch { return null; }
  }
  const [nwc, setNwc] = useState(loadNwc());

  function saveNwc(conn) {
    if (conn) localStorage.setItem("nwc_conn", JSON.stringify(conn));
    else localStorage.removeItem("nwc_conn");
  }

  function parseNwcUri(uri) {
    try {
      if (!uri.startsWith("nostr+walletconnect://")) return null;
      const stripped = uri.replace("nostr+walletconnect://", "https://");
      const u = new URL(stripped);
      return {
        walletPubkey: u.hostname,
        relays: u.searchParams.getAll("relay"),
        secret: u.searchParams.get("secret")
      };
    } catch {
      return null;
    }
  }

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
    if (!nwc) throw new Error("No NWC connection");
    const event = {
      kind: 23194,
      pubkey: window.NostrTools.getPublicKey(nwc.secret),
      created_at: Math.floor(Date.now() / 1000),
      tags: [["p", nwc.walletPubkey]],
      content: await window.NostrTools.nip04.encrypt(
        nwc.secret,
        nwc.walletPubkey,
        JSON.stringify({ method: "pay_invoice", params: { invoice, amount } })
      )
    };
    const signed = window.NostrTools.signEvent(event, nwc.secret);
    await Promise.all((nwc.relays.length ? nwc.relays : relays).map(relayUrl =>
      new Promise(resolve => {
        try {
          const ws = new window.WebSocket(relayUrl);
          ws.onopen = () => {
            ws.send(JSON.stringify(["EVENT", signed]));
            setTimeout(() => ws.close(), 1000);
          };
          ws.onerror = () => { ws.close(); resolve(); };
          ws.onclose = () => resolve();
        } catch { resolve(); }
      })
    ));
  }

  return (
    <NostrContext.Provider value={{
      nostrUser, error, setError, loginWithExtension, logout, hasNip07,
      publishNostrEvent, fetchLatestEvent, fetchEventsFromRelay,
      relays, addRelay, removeRelay, relayStatus,
      publishProfile, fetchProfile,
      nwc, connectNwc, disconnectNwc, sendNwcPayInvoice
    }}>
      {children}
    </NostrContext.Provider>
  );
}
