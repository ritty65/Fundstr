#!/usr/bin/env ts-node
/* eslint-disable no-console */
import { NUTZAP_RELAY_HTTP } from '../src/nutzap/relayConfig.js';

async function main() {
  const npub = process.argv[2];
  if (!npub) {
    console.error('Usage: verifyNutzapProfile <hex-pubkey>');
    process.exit(1);
  }
  // Query kind:10019 from our relay only
  const filters = [{ kinds: [10019], authors: [npub], limit: 1 }];
  const qs = new URLSearchParams({ filters: JSON.stringify(filters) });
  const res = await fetch(`${NUTZAP_RELAY_HTTP}/req?${qs.toString()}`);
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
}
void main();
