import React, { useEffect, useState } from 'react';
import { useNostr, npubEncode } from '../nostr';

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
    <div style={{ margin: '16px 0', border: '1px solid #eee', borderRadius: 10, padding: 10 }}>
      <div style={{ fontWeight: 700 }}>User: {npubEncode(pubkey).slice(0, 14)}...</div>
      {profile && (
        <div>
          {profile.picture && <img src={profile.picture} alt="" style={{ width: 36, borderRadius: '50%', margin: 6 }} />}
          {profile.name && <div><b>Name:</b> {profile.name}</div>}
          {profile.about && <div><b>Bio:</b> {profile.about}</div>}
        </div>
      )}
    </div>
  );
}
