# Fundstr

The "Nostr Patreon-like Platform" is an application that allows creators to set up and offer support tiers to their audience using the decentralized Nostr protocol. Supporters can then discover these creators and pledge their support directly. All tier and pledge information is published as Nostr events, making the system open and resistant to censorship, with users managing their identities via Nostr keys.

## Event Kinds

- **30078** - Creator tier definition.
- **30079** - One-time pledge.
- **30080** - Recurring pledge agreement.

## Wallet Connect

Supporters can optionally connect a Nostr Wallet Connect (NIP-47) compatible wallet.
When a recurring pledge payment is due the app can send a `pay_invoice` request
to the connected wallet. If no wallet is connected, the app will show the
invoice so it can be paid manually.

## Cashu Wallet (NIP-60)

The demo now includes a very small Cashu wallet implementation. Users can
publish wallet metadata and token events using the Cashu tab. Stored token
events follow the [NIP-60](https://nips.nostr.com/60) draft so they can be
synchronized across Nostr clients.
