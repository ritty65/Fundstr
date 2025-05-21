import React, { useState } from 'react';
import { useNostr } from '../nostr';

export default function RelayManager() {
  const { relays, addRelay, removeRelay, relayStatus } = useNostr();
  const [newRelay, setNewRelay] = useState('');
  return (
    <section style={{ marginBottom: 24 }}>
      <h3>Relay Management</h3>
      <ul style={{ paddingLeft: 0 }}>
        {relays.map(relay => (
          <li key={relay} style={{ listStyle: 'none', marginBottom: 4, display: 'flex', alignItems: 'center' }}>
            <span style={{
              display: 'inline-block',
              width: 10, height: 10,
              borderRadius: '50%',
              marginRight: 6,
              background: relayStatus[relay] === 'online' ? 'limegreen' : 'crimson'
            }}></span>
            <span style={{ flex: 1 }}>{relay}</span>
            <button style={{ fontSize: 13, marginLeft: 10 }} onClick={() => removeRelay(relay)}>Remove</button>
          </li>
        ))}
      </ul>
      <div>
        <input
          style={{ minWidth: 230 }}
          placeholder="wss://example.com"
          value={newRelay}
          onChange={e => setNewRelay(e.target.value)}
        />
        <button onClick={() => { if (newRelay) { addRelay(newRelay); setNewRelay(''); } }}>Add Relay</button>
      </div>
    </section>
  );
}
