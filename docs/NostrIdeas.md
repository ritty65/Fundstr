# Nostr Feature Ideas

This document collects potential enhancements for gated content on Fundstr.

## Encrypted Events (NIP-04, NIP-17, NIP-44)
Creators could publish content as encrypted Nostr events. A decryption key or link would be distributed only to public keys that have an active recurring pledge for the relevant tier. Keys are sent via private DMs (NIP-17) to each authorized supporter. This requires the client to maintain a list of supporters per tier and send updates when a supporter joins or leaves.

## Token-Gated Access via External Services
Instead of hosting content purely on Nostr, Fundstr could issue an access token for supporters. This might be a signed Nostr event or a non-transferable badge (NIP-58). External hosting services can verify these tokens to allow or deny access to restricted content.
