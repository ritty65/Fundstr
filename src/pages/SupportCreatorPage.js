import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useNostr, DEFAULT_RELAYS, KIND_MVP_TIER, KIND_PROFILE, KIND_MVP_PLEDGE } from '../nostr';
import RelayManager from '../components/RelayManager';
import ProfileCard from '../components/ProfileCard';

export default function SupportCreatorPage() {
  const { nostrUser, publishNostrEvent, fetchLatestEvent } = useNostr();
  const [creatorKey, setCreatorKey] = useState('');
  const [creatorProfile, setCreatorProfile] = useState(null);
  const [tier, setTier] = useState(null);
  const [error, setError] = useState(null);

  async function handleFetchCreatorTier() {
    setError(null);
    if (!creatorKey) return;
    try {
      const tierEvent = await fetchLatestEvent(creatorKey, KIND_MVP_TIER, DEFAULT_RELAYS[0]);
      if (!tierEvent) { setTier(null); setError('No tier found for this pubkey.'); return; }
      setTier(JSON.parse(tierEvent.content));
      const profEvent = await fetchLatestEvent(creatorKey, KIND_PROFILE, DEFAULT_RELAYS[0]);
      if (profEvent) {
        try { setCreatorProfile(JSON.parse(profEvent.content)); } catch { }
      }
    } catch {
      setError('Could not fetch creator data.');
    }
  }

  async function handlePledgeSupport() {
    if (!nostrUser || !tier) { setError('Connect your Nostr extension and load a tier.'); return; }
    try {
      setError(null);
      const event = {
        kind: KIND_MVP_PLEDGE,
        tags: [
          ['p', creatorKey],
          ['e', tier.id || '']
        ],
        content: 'I pledge support'
      };
      await publishNostrEvent(event);
      alert('Pledge published!');
    } catch (e) {
      setError('Failed to pledge: ' + e.message);
    }
  }

  return (
    <div>
      <RelayManager />
      <h2>Support a Creator</h2>
      <input placeholder="Creator Pubkey" value={creatorKey} onChange={e => setCreatorKey(e.target.value)} />
      <button onClick={handleFetchCreatorTier}>Find Tier</button>
      {creatorProfile && (
        <ProfileCard pubkey={creatorKey} />
      )}
      {tier && (
        <div>
          <h3>Tier</h3>
          <pre>{JSON.stringify(tier, null, 2)}</pre>
          {tier.paymentInstructions && <QRCodeSVG value={tier.paymentInstructions} />}
          <button onClick={handlePledgeSupport}>Pledge Support (Mock)</button>
        </div>
      )}
      {error && <div style={{ color: 'red' }}>{error}</div>}
    </div>
  );
}
