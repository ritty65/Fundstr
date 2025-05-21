# Fundstr

The "Nostr Patreon-like Platform" is an application that allows creators to set up and offer support tiers to their audience using the decentralized Nostr protocol. Supporters can then discover these creators and pledge their support directly. All tier and pledge information is published as Nostr events, making the system open and resistant to censorship, with users managing their identities via Nostr keys.

## Key Storage

Private keys are encrypted in the browser using a passphrase before they are
saved to `localStorage`. When generating or loading a key pair you will be
prompted for this passphrase. The Web Crypto API performs the encryption and the
public key remains unencrypted.
