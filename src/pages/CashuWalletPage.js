import React, { useState } from 'react';
import { useNostr, KIND_CASHU_WALLET, KIND_CASHU_TOKENS } from '../nostr';
import { useUserEvents } from '../hooks/useUserEvents';
import { useNotification } from '../components/NotificationProvider';
import Spinner from '../components/Spinner';

export default function CashuWalletPage() {
  const {
    nostrUser,
    publishCashuWallet,
    addCashuToken
  } = useNostr();
  const { show } = useNotification();
  const [mint, setMint] = useState('');
  const [tokens, setTokens] = useUserEvents(KIND_CASHU_TOKENS);
  const [newToken, setNewToken] = useState('');
  const [error, setError] = useState(null);
  const [working, setWorking] = useState(false);


  async function handlePublishWallet() {
    if (!nostrUser) return;
    try {
      setError(null);
      setWorking(true);
      await publishCashuWallet({ mint });
      show('Wallet event published');
    } catch (e) { setError('Failed: ' + e.message); }
    finally { setWorking(false); }
  }

  async function handleAddToken() {
    if (!nostrUser || !newToken) return;
    try {
      setError(null);
      setWorking(true);
      await addCashuToken({ mint, proofs: [newToken] });
      show('Token event published');
    } catch (e) { setError('Failed: ' + e.message); }
    finally { setWorking(false); }
  }

  return (
    <div>
      {working && <Spinner />}
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
