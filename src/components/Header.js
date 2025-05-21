import React from 'react';
import { useNostr } from '../nostr';
import styles from './Header.module.css';

export default function Header({ onTab, tab, darkMode, onToggleDarkMode }) {
  const { nostrUser, loginWithExtension, logout, error, hasNip07 } = useNostr();
  return (
    <header className={styles.header}>
      <h1>Nostr Patreon MVP</h1>
      <button onClick={() => onTab('creator')}>Creator</button>
      <button onClick={() => onTab('supporter')}>Support a Creator</button>
      <button onClick={() => onTab('profile')}>My Profile</button>
      <button onClick={() => onTab('wallet')}>Cashu Wallet</button>
      <button onClick={() => onTab('follows')}>Follows</button>
      <button onClick={() => onTab('activity')}>Activity</button>
      <button onClick={onToggleDarkMode}>
        {darkMode ? 'Light Mode' : 'Dark Mode'}
      </button>
      <div className={styles.userArea}>
        {nostrUser ? (
          <>
            <div className={styles.userInfo}>
              <strong>npub:</strong> {nostrUser.npub.slice(0, 16)}...
              <br />
              <button className={styles.logoutButton} onClick={logout}>Logout</button>
            </div>
          </>
        ) : (
          <>
            {hasNip07 ? (
              <button onClick={loginWithExtension}>Login with Nostr Extension</button>
            ) : (
              <span className={styles.notDetected}>Nostr extension not detected</span>
            )
          </>
        )}
        {error && <div className={styles.error}>{error}</div>}
      </div>
    </header>
  );
}
