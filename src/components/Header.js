import React, { useState } from 'react';
import { useNostr } from '../nostr';

export default function Header({ onTab, tab }) {
  const { nostrUser, loginWithExtension, logout, error, hasNip07, getPrivateKey } = useNostr();
  const [showKeys, setShowKeys] = useState(false);
  const [nsec, setNsec] = useState(null);

  async function toggleKeys() {
    if (showKeys) {
      setShowKeys(false);
    } else {
      if (!nsec && getPrivateKey) {
        try {
          const pk = await getPrivateKey();
          if (pk) {
            setNsec(window.NostrTools.nip19.nsecEncode(pk));
          }
        } catch {}
      }
      setShowKeys(true);
    }
  }
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
      <h1>Nostr Patreon MVP</h1>
      <button onClick={() => onTab('creator')}>Creator</button>
      <button onClick={() => onTab('supporter')}>Support a Creator</button>
      <button onClick={() => onTab('profile')}>My Profile</button>
      <button onClick={() => onTab('wallet')}>Cashu Wallet</button>
      <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
        {nostrUser ? (
          <>
            <div style={{ fontSize: '0.8em' }}>
              <strong>npub:</strong> {showKeys ? nostrUser.npub : nostrUser.npub.slice(0, 16) + '...'}
              {showKeys && (
                <>
                  <br />
                  {nsec ? (
                    <><strong>nsec:</strong> {nsec}</>
                  ) : (
                    <span style={{ color: 'gray' }}>Private key not accessible</span>
                  )}
                </>
              )}
              <br />
              <button style={{ marginTop: 3 }} onClick={logout}>Logout</button>
              <button style={{ marginLeft: 8 }} onClick={toggleKeys}>{showKeys ? 'Hide Keys' : 'Show Keys'}</button>
            </div>
          </>
        ) : (
          <>
            {hasNip07 ? (
              <button onClick={loginWithExtension}>Login with Nostr Extension</button>
            ) : (
              <span style={{ color: 'gray' }}>Nostr extension not detected</span>
            )
          </>
        )}
        {error && <div style={{ color: 'red', fontSize: '0.85em' }}>{error}</div>}
      </div>
    </header>
  );
}
