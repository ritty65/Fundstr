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

// Utility functions using window.NostrTools (from CDN)
function generatePrivateKey() {
  return window.NostrTools.generatePrivateKey();
}
function getPublicKey(sk) {
  return window.NostrTools.getPublicKey(sk);
}
function getEventHash(ev) {
  return window.NostrTools.getEventHash(ev);
}
function signEvent(ev, sk) {
  return window.NostrTools.getSignature(ev, sk);
}
export function npubEncode(pk) {
  return window.NostrTools.nip19.npubEncode(pk);
}
export function nsecEncode(sk) {
  return window.NostrTools.nip19.nsecEncode(sk);
}

function saveKeys(sk, pk) {
  localStorage.setItem("nostr_sk", sk);
  localStorage.setItem("nostr_pk", pk);
}
function loadKeys() {
  const sk = localStorage.getItem("nostr_sk");
  const pk = localStorage.getItem("nostr_pk");
  if (sk && pk) return { sk, pk };
  return null;
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

  useEffect(() => {
    const keys = loadKeys();
    if (keys) {
      setNostrUser({
        sk: keys.sk,
        pk: keys.pk,
        npub: npubEncode(keys.pk),
        nsec: nsecEncode(keys.sk)
      });
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

  function createNewKeypair() {
    try {
      const sk = generatePrivateKey();
      const pk = getPublicKey(sk);
      saveKeys(sk, pk);
      setNostrUser({ sk, pk, npub: npubEncode(pk), nsec: nsecEncode(sk) });
      setError(null);
    } catch (e) {
      setError("Failed to generate keys: " + e.message);
    }
  }

  function logout() {
    localStorage.removeItem("nostr_sk");
    localStorage.removeItem("nostr_pk");
    setNostrUser(null);
    setError(null);
  }

  async function publishNostrEvent(eventTemplate) {
    if (!nostrUser) throw new Error("Generate your keypair first!");
    try {
      const template = {
        ...eventTemplate,
        pubkey: nostrUser.pk,
        created_at: Math.floor(Date.now() / 1000)
      };
      template.id = getEventHash(template);
      template.sig = signEvent(template, nostrUser.sk);

      let errors = [];
      let successes = 0;
      await Promise.all(relays.map(relayUrl =>
        new Promise(resolve => {
          try {
            const ws = new window.WebSocket(relayUrl);
            let isHandled = false;
            ws.onopen = () => {
              ws.send(JSON.stringify(["EVENT", template]));
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
      return template;
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
    if (!nostrUser) throw new Error("Generate your keypair first!");
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

  return (
    <NostrContext.Provider value={{
      nostrUser, error, setError, createNewKeypair, logout,
      publishNostrEvent, fetchLatestEvent, fetchEventsFromRelay,
      relays, addRelay, removeRelay, relayStatus,
      publishProfile, fetchProfile
    }}>
      {children}
    </NostrContext.Provider>
  );
}
