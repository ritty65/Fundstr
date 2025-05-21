import React, { useState, useEffect } from 'react';
import { useNostr } from '../nostr';

export default function MyProfilePage() {
  const { nostrUser, publishProfile, fetchProfile, setError } = useNostr();
  const [profile, setProfile] = useState({ name: '', picture: '', about: '' });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      if (nostrUser) {
        try {
          const p = await fetchProfile(nostrUser.pk);
          setProfile({ ...p });
        } catch {}
      }
    }
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nostrUser]);

  async function handlePublish() {
    try {
      setError(null);
      await publishProfile(profile);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      setError('Failed to publish profile: ' + e.message);
    }
  }

  return (
    <section>
      <h2>My Profile</h2>
      {!nostrUser && <div style={{ color: 'gray' }}>Login with your Nostr extension to use profile functions.</div>}
      <input placeholder="Name" value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} disabled={!nostrUser} />
      <input placeholder="Picture URL" value={profile.picture} onChange={e => setProfile({ ...profile, picture: e.target.value })} disabled={!nostrUser} />
      <textarea placeholder="Bio/About" value={profile.about} onChange={e => setProfile({ ...profile, about: e.target.value })} disabled={!nostrUser} />
      <br />
      <button onClick={handlePublish} disabled={!nostrUser}>Publish Profile</button>
      {profile.picture && <div style={{ marginTop: 12 }}><img src={profile.picture} alt="profile" style={{ width: 64, height: 64, borderRadius: '50%' }} /></div>}
      {saved && <div style={{ color: 'green' }}>Profile saved to relays!</div>}
    </section>
  );
}
