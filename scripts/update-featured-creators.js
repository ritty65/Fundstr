import { writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { SimplePool, useWebSocketImplementation } from 'nostr-tools/pool';
import { nip19 } from 'nostr-tools';
import WebSocket from 'ws';

// provide WebSocket implementation for nostr-tools in Node without forcing a protocol
function NostrWebSocket(url, opts) {
  return new WebSocket(url, opts);
}
useWebSocketImplementation(NostrWebSocket);

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://relay.snort.social',
  'wss://nos.lol',
  'wss://relay.nostr.band',
];

const FEATURED_NPUBS = [
  'npub1aljmhjp5tqrw3m60ra7t3u8uqq223d6rdg9q0h76a8djd9m4hmvsmlj82m',
  'npub1sg6plzptd64u62a878hep2kev88swjh3tw00gjsfl8f237lmu63q0uf63m',
  'npub1qny3tkh0acurzla8x3zy4nhrjz5zd8l9sy9jys09umwng00manysew95gx',
  'npub1cj8znuztfqkvq89pl8hceph0svvvqk0qay6nydgk9uyq7fhpfsgsqwrz4u',
  'npub1a2cww4kn9wqte4ry70vyfwqyqvpswksna27rtxd8vty6c74era8sdcw83a',
  'npub1s05p3ha7en49dv8429tkk07nnfa9pcwczkf5x5qrdraqshxdje9sq6eyhe',
  'npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6',
  'npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc',
  'npub1s5yq6wadwrxde4lhfs56gn64hwzuhnfa6r9mj476r5s4hkunzgzqrs6q7z',
  'npub1spdnfacgsd7lk0nlqkq443tkq4jx9z6c6ksvaquuewmw7d3qltpslcq6j7',
];

async function fetchEventsFromRelays(relays, filter, maxWait = 7000) {
  const pool = new SimplePool();
  const events = await pool.querySync(relays, filter, { maxWait });
  pool.destroy();
  return events;
}

async function fetchProfiles() {
  const authors = FEATURED_NPUBS.map((npub) => {
    try {
      return nip19.decode(npub).data;
    } catch {
      return null;
    }
  }).filter((hex) => hex !== null);

  const events = await fetchEventsFromRelays(DEFAULT_RELAYS, {
    kinds: [0],
    authors,
  });
  const profileMap = new Map();
  for (const event of events) {
    try {
      const profileData = JSON.parse(event.content);
      const existing = profileMap.get(event.pubkey);
      if (!existing || event.created_at > existing.created_at) {
        profileMap.set(event.pubkey, {
          pubkey: event.pubkey,
          name: profileData.name || profileData.display_name || profileData.username || '',
          nip05: profileData.nip05 || '',
          picture: profileData.picture || '',
          about: profileData.about || '',
          lud16: profileData.lud16 || '',
          created_at: event.created_at,
        });
      }
    } catch (e) {
      console.error('Failed to parse profile event content', e);
    }
  }
  return Array.from(profileMap.values());
}

async function main() {
  const profiles = await fetchProfiles();
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const outPath = path.resolve(__dirname, '..', 'public', 'featured-creators.json');
  await writeFile(outPath, JSON.stringify(profiles, null, 2));
  console.log(`Wrote ${profiles.length} profiles to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

