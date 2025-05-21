import React from 'react';
import { Link } from 'react-router-dom';
import { useNostr } from '../nostr';

export default function Header() {
  const { nostrUser, loginWithExtension, logout, error, hasNip07 } = useNostr();
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
      <h1>Nostr Patreon MVP</h1>
      <Link to="/creator">Creator</Link>
      <Link to="/supporter">Support a Creator</Link>
      <Link to="/profile">My Profile</Link>
      <Link to="/wallet">Cashu Wallet</Link>
      <Link to="/follows">Follows</Link>
      <Link to="/activity">Activity</Link>
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
