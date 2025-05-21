import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useNostr, DEFAULT_RELAYS, KIND_MVP_TIER, KIND_PROFILE, KIND_MVP_PLEDGE } from '../nostr';
import RelayManager from '../components/RelayManager';
import ProfileCard from '../components/ProfileCard';

export default function SupportCreatorPage() {
  const { nostrUser, publishNostrEvent, fetchLatestEvent, npubDecode, resolveNip05 } = useNostr();
  const [inputId, setInputId] = useState('');
  const [creatorKey, setCreatorKey] = useState('');
  const [creatorProfile, setCreatorProfile] = useState(null);
  const [tier, setTier] = useState(null);
  const [error, setError] = useState(null);

  async function handleFetchCreatorTier() {
    setError(null);
    let pk = inputId.trim();
    if (!pk) return;
    if (pk.includes('@') && !pk.match(/^[a-f0-9]{64}$/i)) {
      const resolved = await resolveNip05(pk);
      if (!resolved) { setError('NIP-05 identifier not found.'); return; }
      pk = resolved;
    } else if (pk.startsWith('npub')) {
      const decoded = npubDecode(pk);
      if (!decoded) { setError('Invalid npub.'); return; }
      pk = decoded;
    }
    setCreatorKey(pk);
    try {
      const tierEvent = await fetchLatestEvent(pk, KIND_MVP_TIER, DEFAULT_RELAYS[0]);
      if (!tierEvent) { setTier(null); setError('No tier found for this pubkey.'); return; }
      setTier(JSON.parse(tierEvent.content));
      const profEvent = await fetchLatestEvent(pk, KIND_PROFILE, DEFAULT_RELAYS[0]);
      if (profEvent) {
        try { setCreatorProfile(JSON.parse(profEvent.content)); } catch { }
      }
    } catch {
      setError('Could not fetch creator data.');
    }
  }

  async function handlePledgeSupport() {
    if (!nostrUser || !tier) { setError('Generate your keypair and load a tier.'); return; }
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
      <input
        placeholder="Creator npub or NIP-05"
        value={inputId}
        onChange={e => setInputId(e.target.value)}
      />
      <button onClick={handleFetchCreatorTier}>Find Tier</button>
      {creatorKey && <div style={{ fontSize: '0.8em', marginTop: 4 }}>Pubkey: {creatorKey}</div>}
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
