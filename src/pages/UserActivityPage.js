import React, { useState } from 'react';
import { useNostr } from '../nostr';

export default function UserActivityPage() {
  const { nostrUser, fetchReactions, fetchZapReceipts, fetchProfileBadges } = useNostr();
  const [targetKey, setTargetKey] = useState('');
  const [reactions, setReactions] = useState([]);
  const [zapReceipts, setZapReceipts] = useState({ zapper: [], recipient: [] });
  const [badges, setBadges] = useState([]);

  async function load() {
    const pk = targetKey || nostrUser?.pk;
    if (!pk) return;
    const evs = await fetchReactions(pk);
    setReactions(evs);
    const rec = await fetchZapReceipts(pk);
    setZapReceipts(rec);
    const b = await fetchProfileBadges(pk);
    setBadges(b);
  }

  return (
    <section>
      <h2>User Reactions</h2>
      <div style={{ marginBottom: 12 }}>
        <input
          placeholder="Pubkey"
          value={targetKey}
          onChange={e => setTargetKey(e.target.value)}
        />
        <button onClick={load} style={{ marginLeft: 8 }}>Load</button>
      </div>
      <ul>
        {reactions.map(ev => (
          <li key={ev.id}>
            {ev.content} to {ev.tags.find(t => t[0] === 'e')?.[1] || ''}
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 24 }}>
        <h2>Zap Receipts</h2>
        <div>
          <h3>As Zapper</h3>
          <ul>
            {zapReceipts.zapper.map(ev => (
              <li key={ev.id}>
                to {ev.tags.find(t => t[0] === 'p')?.[1] || ''}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>As Recipient</h3>
          <ul>
            {zapReceipts.recipient.map(ev => {
              let zapper = '';
              const desc = ev.tags.find(t => t[0] === 'description')?.[1];
              if (desc) {
                try { zapper = JSON.parse(desc).pubkey; } catch {}
              }
              return (
                <li key={ev.id}>
                  from {zapper || ev.pubkey}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <div style={{ marginTop: 24 }}>
        <h2>Profile Badges</h2>
        <ul>
          {badges.map(b => {
            let name = '';
            if (b.definition) {
              try {
                const parsed = JSON.parse(b.definition.content);
                name = parsed.name || parsed.description || b.definition.content;
              } catch {
                name = b.definition.content;
              }
            }
            return (
              <li key={b.id}>
                {name || 'Badge'} - awarded by {b.award?.pubkey || 'unknown'}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
