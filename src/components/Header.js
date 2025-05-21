import React, { useEffect, useState } from 'react';
import { useNostr } from '../nostr';

export default function Header({ onTab, tab }) {
  const { nostrUser, loginWithExtension, logout, error, hasNip07, fetchProfile } = useNostr();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (!nostrUser) { setProfile(null); return; }
    (async () => {
      try { setProfile(await fetchProfile(nostrUser.pk)); } catch {}
    })();
  }, [nostrUser, fetchProfile]);

  return (
    <header>
      {profile?.picture && <img src={profile.picture} alt="avatar" className="profile-avatar" />}
      <h1>Nostr Patreon MVP</h1>
      <button onClick={() => onTab('creator')}>Creator</button>
      <button onClick={() => onTab('supporter')}>Support a Creator</button>
      <button onClick={() => onTab('profile')}>My Profile</button>
      <button onClick={() => onTab('wallet')}>Cashu Wallet</button>
      <button onClick={() => onTab('follows')}>Follows</button>
      <button onClick={() => onTab('activity')}>Activity</button>
      <div className="header-right">
        {nostrUser ? (
          <>
            <div className="small">
              <strong>npub:</strong> {nostrUser.npub.slice(0, 16)}...
              <br />
              <button className="mt-1" onClick={logout}>Logout</button>
            </div>
          </>
        ) : (
          <>
            {hasNip07 ? (
              <button onClick={loginWithExtension}>Login with Nostr Extension</button>
            ) : (
              <span className="text-gray">Nostr extension not detected</span>
            )
          </>
        )}
        {error && <div className="error small">{error}</div>}
      </div>
    </header>
  );
}
