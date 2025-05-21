import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useNostr, DEFAULT_RELAYS, KIND_MVP_TIER, KIND_MVP_PLEDGE, KIND_RECURRING_PLEDGE } from '../nostr';
import RelayManager from '../components/RelayManager';
import ProfileCard from '../components/ProfileCard';

export default function CreatorSetupPage() {
  const { nostrUser, publishNostrEvent, fetchLatestEvent, fetchEventsFromRelay, setError } = useNostr();
  const [tier, setTier] = useState({ title: '', amount: '', paymentInstructions: '' });
  const [currentTier, setCurrentTier] = useState(null);
  const [supporters, setSupporters] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!nostrUser) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const latestTier = await fetchLatestEvent(nostrUser.pk, KIND_MVP_TIER, DEFAULT_RELAYS[0]);
        setCurrentTier(latestTier ? JSON.parse(latestTier.content) : null);
        if (latestTier) {
          const pledges = await fetchEventsFromRelay({ kinds: [KIND_MVP_PLEDGE, KIND_RECURRING_PLEDGE], '#p': [nostrUser.pk] }, DEFAULT_RELAYS[0]);
          setSupporters(pledges);
        }
      } catch (e) {
        setError('Failed to load creator data.');
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nostrUser]);

  async function handlePublishTier() {
    if (!nostrUser) return alert('Connect your Nostr extension first');
    try {
      setError(null);
      const event = {
        kind: KIND_MVP_TIER,
        tags: [['d', 'mvp-creator-tier']],
        content: JSON.stringify({ ...tier, currency: 'BTC' })
      };
      await publishNostrEvent(event);
      alert('Tier published!');
    } catch (e) {
      setError('Failed to publish: ' + e.message);
    }
  }

  return (
    <div>
      <RelayManager />
      <h2>Creator Setup</h2>
      {!nostrUser && <div style={{ color: 'gray' }}>Login with your Nostr extension to use creator functions.</div>}
      <div>
        <input placeholder="Tier Title" value={tier.title} onChange={e => setTier({ ...tier, title: e.target.value })} disabled={!nostrUser} />
        <input placeholder="Amount (in sats)" type="number" value={tier.amount} onChange={e => setTier({ ...tier, amount: e.target.value })} disabled={!nostrUser} />
        <input placeholder="Payment Instructions (e.g., BTC address)" value={tier.paymentInstructions} onChange={e => setTier({ ...tier, paymentInstructions: e.target.value })} disabled={!nostrUser} />
        <input value="BTC" readOnly style={{ width: 64 }} title="Only BTC allowed" />
        <button onClick={handlePublishTier} disabled={!nostrUser}>Publish Tier</button>
      </div>
      <h3>Current Tier</h3>
      <pre>{currentTier ? JSON.stringify(currentTier, null, 2) : 'None'}</pre>
      {currentTier?.paymentInstructions && <QRCodeSVG value={currentTier.paymentInstructions} />}
      <h3>Supporters</h3>
      {loading ? 'Loading...' : (
        <ul>
          {supporters.map(ev => (
            <li key={ev.id}>
              <ProfileCard pubkey={ev.pubkey} />
              {ev.kind === KIND_RECURRING_PLEDGE && (
                <div style={{ fontSize: '0.9em' }}>
                  Recurring {ev.tags.find(t => t[0] === 'period')?.[1]} - {ev.tags.find(t => t[0] === 'status')?.[1]}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
