import React from 'react';
import { useNostr } from '../nostr';

export default function Header({ onTab, tab }) {
  const { nostrUser, loginWithExtension, logout, error, hasNip07 } = useNostr();
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
      <h1>Nostr Patreon MVP</h1>
      <button onClick={() => onTab('creator')}>Creator</button>
      <button onClick={() => onTab('supporter')}>Support a Creator</button>
      <button onClick={() => onTab('profile')}>My Profile</button>
      <button onClick={() => onTab('wallet')}>Cashu Wallet</button>
      <button onClick={() => onTab('follows')}>Follows</button>
      <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
        {nostrUser ? (
          <>
            <div style={{ fontSize: '0.8em' }}>
              <strong>npub:</strong> {nostrUser.npub.slice(0, 16)}...
              <br />
              <button style={{ marginTop: 3 }} onClick={logout}>Logout</button>
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
