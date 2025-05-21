import React, { useState } from 'react';

export default function KeyManager() {
  const [nsec, setNsec] = useState('');
  const [npub, setNpub] = useState('');

  function generate() {
    const sk = window.NostrTools.generatePrivateKey();
    const pk = window.NostrTools.getPublicKey(sk);
    setNsec(window.NostrTools.nip19.nsecEncode(sk));
    setNpub(window.NostrTools.nip19.npubEncode(pk));
  }

  return (
    <section>
      <h2>Key Manager</h2>
      <p style={{ color: 'red' }}>
        Warning: anyone with your <code>nsec</code> can control your Nostr identity.
        Keep it secret and store it safely.
      </p>
      <button onClick={generate}>Generate Key Pair</button>
      {nsec && (
        <div style={{ marginTop: 12 }}>
          <div><strong>nsec:</strong> {nsec}</div>
          <div><strong>npub:</strong> {npub}</div>
        </div>
      )}
    </section>
  );
}
