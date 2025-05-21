import React, { useEffect, useState } from 'react';
import { useNostr, npubEncode } from '../nostr';
import styles from './ProfileCard.module.css';

export default function ProfileCard({ pubkey }) {
  const { fetchProfile } = useNostr();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    async function get() {
      const p = await fetchProfile(pubkey);
      setProfile(p);
    }
    get();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkey]);

  if (!pubkey) return null;
  return (
    <div className={styles.card}>
      <div className={styles.username}>User: {npubEncode(pubkey).slice(0, 14)}...</div>
      {profile && (
        <div>
          {profile.picture && <img src={profile.picture} alt="" className={styles.avatar} />}
          {profile.name && <div><b>Name:</b> {profile.name}</div>}
          {profile.about && <div><b>Bio:</b> {profile.about}</div>}
        </div>
      )}
    </div>
  );
}
