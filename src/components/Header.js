import React, { useState } from 'react';
import { useNostr } from '../nostr';
import styles from './Header.module.css';
import DarkModeToggle from './DarkModeToggle';

export default function Header({ onTab, tab, darkMode, onToggleDarkMode }) {
  const { nostrUser, loginWithExtension, loginWithPrivateKey, loginWithEncryptedKey, saveEncryptedKey, removeEncryptedKey, encryptedSk, logout, error, hasNip07 } = useNostr();
  const [privKey, setPrivKey] = useState('');
  const [encPass, setEncPass] = useState("");
  const [decPass, setDecPass] = useState("");
  return (
    <header className={styles.header}>
      <h1>Nostr Patreon MVP</h1>
      <button onClick={() => onTab('creator')}>Creator</button>
      <button onClick={() => onTab('supporter')}>Support a Creator</button>
      <button onClick={() => onTab('profile')}>My Profile</button>
      <button onClick={() => onTab('wallet')}>Cashu Wallet</button>
      <button onClick={() => onTab('follows')}>Follows</button>
      <button onClick={() => onTab('activity')}>Activity</button>
      <button onClick={() => onTab('keys')}>Key Manager</button>
      <DarkModeToggle darkMode={darkMode} onToggleDarkMode={onToggleDarkMode} />
      <div className={styles.userArea}>
        {nostrUser ? (
          <>
            <div className={styles.userInfo}>
              <strong>npub:</strong> {nostrUser.npub.slice(0, 16)}...
              <br />
              <button className={styles.logoutButton} onClick={logout}>Logout</button>
            </div>
            {nostrUser.sk && (
              <div className={styles.encryptArea}>
                <input
                  type="password"
                  placeholder="Password"
                  value={encPass}
                  onChange={e => setEncPass(e.target.value)}
                />
                <button onClick={() => { saveEncryptedKey(encPass); setEncPass(''); }}>
                  Save Encrypted Key
                </button>
              </div>
            )}
            {encryptedSk && (
              <button onClick={removeEncryptedKey}>Remove Saved Key</button>
            )}
          </>
        ) : (
          <>
            {encryptedSk && (
              <div>
                <input
                  type="password"
                  placeholder="Password"
                  value={decPass}
                  onChange={e => setDecPass(e.target.value)}
                />
                <button onClick={() => loginWithEncryptedKey(decPass)}>Unlock Saved Key</button>
                <button onClick={removeEncryptedKey}>Remove</button>
              </div>
            )}
            {hasNip07 ? (
              <button onClick={loginWithExtension}>Login with Nostr Extension</button>
            ) : (
              <span className={styles.notDetected}>Nostr extension not detected</span>
            )}
            <div>
              <input
                type="text"
                placeholder="nsec..."
                value={privKey}
                onChange={e => setPrivKey(e.target.value)}
              />
              <button onClick={() => loginWithPrivateKey(privKey)}>Login with Private Key</button>
            </div>
          </>
        )}
        {error && <div className={styles.error}>{error}</div>}
      </div>
    </header>
  );
}
