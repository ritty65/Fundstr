export const KIND_CASHU_WALLET = 17375;
export const KIND_CASHU_TOKENS = 7375;

export function useCashu({
  relays,
  nostrUser,
  publishNostrEvent,
  fetchLatestEvent,
  fetchEventsFromRelay
}) {
  async function fetchCashuWallet(pubkey) {
    for (const relay of relays) {
      const ev = await fetchLatestEvent(pubkey, KIND_CASHU_WALLET, relay);
      if (ev) {
        try {
          return JSON.parse(ev.content);
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  async function fetchCashuTokens(pubkey) {
    const evs = [];
    for (const relay of relays) {
      const res = await fetchEventsFromRelay(
        { authors: [pubkey], kinds: [KIND_CASHU_TOKENS] },
        relay
      );
      if (res.length) evs.push(...res);
    }
    return evs;
  }

  async function publishCashuWallet(data) {
    return await publishNostrEvent({
      kind: KIND_CASHU_WALLET,
      tags: [['mint', data.mint]],
      content: JSON.stringify(data)
    });
  }

  async function addCashuToken(token) {
    return await publishNostrEvent({
      kind: KIND_CASHU_TOKENS,
      tags: [],
      content: JSON.stringify(token)
    });
  }

  async function sendCashuToken(tokenEvent, toPubkey) {
    if (!nostrUser) throw new Error('Connect your Nostr extension first!');
    const enc = await window.nostr.nip04.encrypt(toPubkey, tokenEvent.content);
    await publishNostrEvent({
      kind: 4,
      tags: [['p', toPubkey]],
      content: enc
    });
    await publishNostrEvent({
      kind: 5,
      tags: [['e', tokenEvent.id], ['k', String(KIND_CASHU_TOKENS)]],
      content: ''
    });
  }

  return {
    fetchCashuWallet,
    fetchCashuTokens,
    publishCashuWallet,
    addCashuToken,
    sendCashuToken
  };
}
