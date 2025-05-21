import React, { useState } from 'react';
import { useNostr } from '../nostr';

export default function UserActivityPage() {
  const { nostrUser, fetchReactions } = useNostr();
  const [targetKey, setTargetKey] = useState('');
  const [reactions, setReactions] = useState([]);

  async function load() {
    const pk = targetKey || nostrUser?.pk;
    if (!pk) return;
    const evs = await fetchReactions(pk);
    setReactions(evs);
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
    </section>
  );
}
