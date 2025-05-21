import React, { useState, useEffect } from 'react';
import { useNostr, DEFAULT_RELAYS } from '../nostr';

export default function CashuWalletPage() {
  const { nostrUser, publishNostrEvent, fetchLatestEvent, fetchEventsFromRelay } = useNostr();
  const [wallet, setWallet] = useState(null);
  const [mint, setMint] = useState('');
  const [tokens, setTokens] = useState([]);
  const [newToken, setNewToken] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!nostrUser) return;
    (async () => {
      try {
        const w = await fetchLatestEvent(nostrUser.pk, 17375, DEFAULT_RELAYS[0]);
        if (w) setWallet(JSON.parse(w.content));
        const ts = await fetchEventsFromRelay({ authors: [nostrUser.pk], kinds: [7375] }, DEFAULT_RELAYS[0]);
        setTokens(ts);
      } catch {}
    })();
  }, [nostrUser]);

  async function handlePublishWallet() {
    if (!nostrUser) return;
    try {
      setError(null);
      await publishNostrEvent({
        kind: 17375,
        tags: [["mint", mint]],
        content: JSON.stringify({ mint })
      });
      alert('Wallet event published');
    } catch (e) { setError('Failed: ' + e.message); }
  }

  async function handleAddToken() {
    if (!nostrUser || !newToken) return;
    try {
      setError(null);
      await publishNostrEvent({
        kind: 7375,
        tags: [],
        content: JSON.stringify({ mint, proofs: [newToken] })
      });
      alert('Token event published');
    } catch (e) { setError('Failed: ' + e.message); }
  }

  return (
    <div>
      <h2>Cashu Wallet</h2>
      {!nostrUser && <div style={{ color: 'gray' }}>Login with your Nostr extension first.</div>}
      <div style={{ marginBottom: 20 }}>
        <input placeholder="Mint URL" value={mint} onChange={e => setMint(e.target.value)} disabled={!nostrUser} />
        <button onClick={handlePublishWallet} disabled={!nostrUser}>Publish Wallet</button>
      </div>
      <div style={{ marginBottom: 20 }}>
        <input placeholder="New proof" value={newToken} onChange={e => setNewToken(e.target.value)} disabled={!nostrUser} />
        <button onClick={handleAddToken} disabled={!nostrUser}>Add Token</button>
      </div>
      <h3>Stored Tokens</h3>
      <ul>
        {tokens.map(ev => (
          <li key={ev.id}>{ev.content.slice(0, 64)}...</li>
        ))}
      </ul>
      {error && <div style={{ color: 'red' }}>{error}</div>}
    </div>
  );
}
