import React, { useState } from 'react';

export default function KeyManager() {
  const [nsec, setNsec] = useState('');
  const [npub, setNpub] = useState('');
  const [words, setWords] = useState('');
  const [restoreWords, setRestoreWords] = useState('');
  const [error, setError] = useState('');

  function generate() {
    let sk = '';
    let seed = '';
    if (window.NostrTools && window.NostrTools.nip06) {
      seed = window.NostrTools.nip06.generateSeedWords();
      sk = window.NostrTools.nip06.privateKeyFromSeedWords(seed);
      setWords(Array.isArray(seed) ? seed.join(' ') : seed);
    } else {
      sk = window.NostrTools.generatePrivateKey();
      setWords('');
    }
    const pk = window.NostrTools.getPublicKey(sk);
    setNsec(window.NostrTools.nip19.nsecEncode(sk));
    setNpub(window.NostrTools.nip19.npubEncode(pk));
    setError('');
  }

  function restore() {
    if (!restoreWords) return;
    try {
      const sk = window.NostrTools.nip06.privateKeyFromSeedWords(restoreWords.trim());
      const pk = window.NostrTools.getPublicKey(sk);
      setNsec(window.NostrTools.nip19.nsecEncode(sk));
      setNpub(window.NostrTools.nip19.npubEncode(pk));
      setWords(restoreWords.trim());
      setError('');
    } catch (e) {
      setError('Invalid mnemonic');
    }
  }

  return (
    <section>
      <h2>Key Manager</h2>
      <p style={{ color: 'red' }}>
        Warning: anyone with your <code>nsec</code> can control your Nostr identity.
        Keep it secret and store it safely.
      </p>
      <button onClick={generate}>Generate Key Pair</button>
      {words && (
        <div style={{ marginTop: 12 }}>
          <div><strong>Mnemonic:</strong> {words}</div>
          <div style={{ color: 'red' }}>Write these words down and store them securely.</div>
        </div>
      )}
      {nsec && (
        <div style={{ marginTop: 12 }}>
          <div><strong>nsec:</strong> {nsec}</div>
          <div><strong>npub:</strong> {npub}</div>
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        <h3>Restore from Mnemonic</h3>
        <input
          type="text"
          placeholder="seed words"
          value={restoreWords}
          onChange={e => setRestoreWords(e.target.value)}
          style={{ width: '100%' }}
        />
        <button onClick={restore}>Restore</button>
      </div>
      {error && <div style={{ color: 'red' }}>{error}</div>}
    </section>
  );
}
