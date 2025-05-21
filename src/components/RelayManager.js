import React, { useState } from 'react';
import { useNostr } from '../nostr';

export default function RelayManager() {
  const { relays, addRelay, removeRelay, relayStatus } = useNostr();
  const [newRelay, setNewRelay] = useState('');
  return (
    <section className="section">
      <h3>Relay Management</h3>
      <ul>
        {relays.map(relay => (
          <li key={relay} className="flex mb-1 no-bullet">
            <span className="status-indicator" style={{ background: relayStatus[relay] === 'online' ? 'limegreen' : 'crimson' }}></span>
            <span className="flex-1">{relay}</span>
            <button className="ml-2 small" onClick={() => removeRelay(relay)}>Remove</button>
          </li>
        ))}
      </ul>
      <div className="mb-2">
        <input
          className="min-230"
          placeholder="wss://example.com"
          value={newRelay}
          onChange={e => setNewRelay(e.target.value)}
        />
        <button className="ml-2" onClick={() => { if (newRelay) { addRelay(newRelay); setNewRelay(''); } }}>Add Relay</button>
      </div>
    </section>
  );
}
