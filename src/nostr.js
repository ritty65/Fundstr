import React, { useState, useEffect, createContext, useContext } from 'react';
import { useRelays, DEFAULT_RELAYS } from './hooks/useRelays';
import { useWalletConnect } from './hooks/useWalletConnect';
import { useCashu } from './hooks/useCashu';
import { saveEncrypted, loadEncrypted, encryptPrivKey, decryptPrivKey } from "./utils/crypto";

export { DEFAULT_RELAYS }; // re-export
export const KIND_PROFILE = 0;
export const KIND_MVP_TIER = 30078;
export const KIND_MVP_PLEDGE = 30079;
export const KIND_RECURRING_PLEDGE = 30080;
export const KIND_CASHU_WALLET = 17375;
export const KIND_CASHU_TOKENS = 7375;
export const KIND_CASHU_HISTORY = 7376;

const NostrContext = createContext();

export function useNostr() {
  return useContext(NostrContext);
}

export function npubEncode(pk) {
  return window.NostrTools.nip19.npubEncode(pk);
}

export function NostrProvider({ children }) {
  const [nostrUser, setNostrUser] = useState(null);
  const { relays, relayStatus, addRelay, removeRelay } = useRelays(DEFAULT_RELAYS);
  const [error, setError] = useState(null);
  const [hasNip07, setHasNip07] = useState(false);
  const [encryptedSk, setEncryptedSk] = useState(loadEncrypted());
  useEffect(() => saveEncrypted(encryptedSk), [encryptedSk]);

  useEffect(() => {
    if (window.nostr && window.nostr.getPublicKey && window.nostr.signEvent) {
      setHasNip07(true);
    }
  }, []);

  // relay management handled by useRelays

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

  function loginWithPrivateKey(nsec) {
    try {
      const decoded = window.NostrTools.nip19.decode(nsec);
      if (decoded.type !== 'nsec') {
        throw new Error('Invalid nsec string');
      }
      const sk = decoded.data;
      const pk = window.NostrTools.getPublicKey(sk);
      setNostrUser({ pk, sk, npub: npubEncode(pk) });
      setError(null);
    } catch (e) {
      setError('Failed to use private key: ' + e.message);
    }
  }
  async function loginWithEncryptedKey(password) {
    if (!encryptedSk) {
      setError("No encrypted key");
      return;
    }
    try {
      const sk = await decryptPrivKey(encryptedSk, password);
      const pk = window.NostrTools.getPublicKey(sk);
      setNostrUser({ pk, sk, npub: npubEncode(pk) });
      setError(null);
    } catch (e) {
      setError("Failed to decrypt key: " + e.message);
    }
  }

  async function saveEncryptedKey(password) {
    if (!nostrUser || !nostrUser.sk) return false;
    try {
      const enc = await encryptPrivKey(nostrUser.sk, password);
      setEncryptedSk(enc);
      setError(null);
      return true;
    } catch (e) {
      setError("Failed to encrypt key: " + e.message);
      return false;
    }
  }

  function removeEncryptedKey() {
    setEncryptedSk(null);
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

  // --- Follower/Following helpers ---
  async function fetchFollowingList(pubkey) {
    for (const relay of relays) {
      const ev = await fetchLatestEvent(pubkey, 3, relay);
      if (ev) {
        return ev.tags.filter(t => t[0] === "p").map(t => t[1]);
      }
    }
    return [];
  }

  async function fetchFollowersList(pubkey) {
    let events = [];
    for (const relay of relays) {
      const res = await fetchEventsFromRelay({ kinds: [3], "#p": [pubkey] }, relay);
      if (res.length) events.push(...res);
    }
    const pks = Array.from(new Set(events.map(ev => ev.pubkey)));
    return pks;
  }

  async function requestCount(filter, relayUrl) {
    return new Promise(resolve => {
      try {
        const ws = new window.WebSocket(relayUrl);
        const subId = Math.random().toString(36).slice(2);
        ws.onopen = () => { ws.send(JSON.stringify(["COUNT", subId, filter])); };
        ws.onmessage = e => {
          const data = JSON.parse(e.data);
          if (data[0] === "COUNT" && data[1] === subId) {
            ws.close();
            resolve(data[2].count);
          }
          if (data[0] === "EOSE" && data[1] === subId) { ws.close(); resolve(null); }
        };
        ws.onerror = () => { ws.close(); resolve(null); };
      } catch { resolve(null); }
    });
  }

  async function countFollowing(pubkey) {
    for (const relay of relays) {
      const cnt = await requestCount({ kinds: [3], authors: [pubkey] }, relay);
      if (typeof cnt === "number") return cnt;
    }
    const list = await fetchFollowingList(pubkey);
    return list.length;
  }

  async function countFollowers(pubkey) {
    for (const relay of relays) {
      const cnt = await requestCount({ kinds: [3], "#p": [pubkey] }, relay);
      if (typeof cnt === "number") return cnt;
    }
    const list = await fetchFollowersList(pubkey);
    return list.length;
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

  // --- Cashu wallet helpers handled by useCashu ---

  async function fetchReactions(pubkey) {
    const events = [];
    for (const relay of relays) {
      const res = await fetchEventsFromRelay({ authors: [pubkey], kinds: [7] }, relay);
      if (res.length) events.push(...res);
    }
    return events;
  }

  async function fetchZapReceipts(pubkey) {
    const events = [];
    for (const relay of relays) {
      const res = await fetchEventsFromRelay({ kinds: [9735] }, relay);
      if (res.length) events.push(...res);
    }
    const dedup = {};
    const zapper = [];
    const recipient = [];
    for (const ev of events) {
      if (dedup[ev.id]) continue;
      dedup[ev.id] = true;
      let zapReq = null;
      const descTag = ev.tags.find(t => t[0] === "description");
      if (descTag) {
        try { zapReq = JSON.parse(descTag[1]); } catch {}
      }
      if (zapReq && zapReq.pubkey === pubkey) {
        zapper.push(ev);
      }
      if (ev.tags.some(t => t[0] === "p" && t[1] === pubkey)) {
        recipient.push(ev);
      }
    }
    return { zapper, recipient };
  }

  async function fetchProfileBadges(pubkey) {
    let prof = null;
    for (const relay of relays) {
      prof = await fetchLatestEvent(pubkey, 30008, relay);
      if (prof) break;
    }
    if (!prof) return [];
    const ids = prof.tags.filter(t => t[0] === "e").map(t => t[1]);
    const badges = [];
    for (const id of ids) {
      let award = null;
      for (const relay of relays) {
        const res = await fetchEventsFromRelay({ ids: [id], kinds: [8] }, relay);
        if (res.length) { award = res[0]; break; }
      }
      let definition = null;
      if (award) {
        const aTag = award.tags.find(t => t[0] === "a");
        if (aTag) {
          const parts = aTag[1].split(":");
          if (parts.length === 3) {
            const [, author, d] = parts;
            for (const relay of relays) {
              const res = await fetchEventsFromRelay({ kinds: [30009], authors: [author], "#d": [d] }, relay);
              if (res.length) { definition = res[0]; break; }
            }
          } else {
            for (const relay of relays) {
              const res = await fetchEventsFromRelay({ kinds: [30009], ids: [aTag[1]] }, relay);
              if (res.length) { definition = res[0]; break; }
            }
          }
        }
        if (!definition) {
          const eTag = award.tags.find(t => t[0] === "e");
          if (eTag) {
            for (const relay of relays) {
              const res = await fetchEventsFromRelay({ kinds: [30009], ids: [eTag[1]] }, relay);
              if (res.length) { definition = res[0]; break; }
            }
          }
        }
      }
      badges.push({ id, award, definition });
    }
    return badges;
  }

  const {
    fetchCashuWallet,
    fetchCashuTokens,
    publishCashuWallet,
    addCashuToken,
    sendCashuToken
  } = useCashu({
    relays,
    nostrUser,
    publishNostrEvent,
    fetchLatestEvent,
    fetchEventsFromRelay
  });

  // --- NIP-47 wallet connect helpers handled by useWalletConnect ---
  const { nwc, connectNwc, disconnectNwc, sendNwcPayInvoice } = useWalletConnect(relays);

  return (
    <NostrContext.Provider value={{
      nostrUser, error, setError, loginWithExtension, loginWithPrivateKey, loginWithEncryptedKey, logout, hasNip07,
      publishNostrEvent, saveEncryptedKey, removeEncryptedKey, encryptedSk, fetchLatestEvent, fetchEventsFromRelay,
      relays, addRelay, removeRelay, relayStatus,
      publishProfile, fetchProfile,
      fetchCashuWallet, fetchCashuTokens, fetchReactions, fetchZapReceipts,
      fetchProfileBadges,
      publishCashuWallet, addCashuToken, sendCashuToken,
      fetchFollowingList, fetchFollowersList, countFollowing, countFollowers,
      nwc, connectNwc, disconnectNwc, sendNwcPayInvoice
    }}>
      {children}
    </NostrContext.Provider>
  );
}
