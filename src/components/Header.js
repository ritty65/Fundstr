import React from 'react';
import { useNostr } from '../nostr';

export default function Header({ onTab, tab }) {
  const { nostrUser, createNewKeypair, logout, error } = useNostr();
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
      <h1>Nostr Patreon MVP</h1>
      <button onClick={() => onTab('creator')}>Creator</button>
      <button onClick={() => onTab('supporter')}>Support a Creator</button>
      <button onClick={() => onTab('profile')}>My Profile</button>
      <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
        {nostrUser ? (
          <>
            <div style={{ fontSize: '0.8em' }}>
              <strong>npub:</strong> {nostrUser.npub.slice(0, 16)}...<br />
              <strong>nsec:</strong> {nostrUser.nsec.slice(0, 10)}...
              <br /><button style={{ marginTop: 3 }} onClick={logout}>Forget Key</button>
            </div>
          </>
        ) : (
          <button onClick={createNewKeypair}>Create New Key Pair</button>
        )}
        {error && <div style={{ color: 'red', fontSize: '0.85em' }}>{error}</div>}
      </div>
    </header>
  );
}
