import React, { useState, useEffect } from 'react';
import { useNostr, DEFAULT_RELAYS, KIND_MVP_TIER, KIND_PROFILE } from '../nostr';
import ProfileCard from '../components/ProfileCard';

export default function DiscoverPage() {
  const { fetchEventsFromRelay } = useNostr();
  const [events, setEvents] = useState([]);
  const [keyword, setKeyword] = useState('');
  const [filtered, setFiltered] = useState([]);

  useEffect(() => {
    async function load() {
      const prof = await fetchEventsFromRelay({ kinds: [KIND_PROFILE], limit: 100 }, DEFAULT_RELAYS[0]);
      const tiers = await fetchEventsFromRelay({ kinds: [KIND_MVP_TIER], limit: 100 }, DEFAULT_RELAYS[0]);
      const all = [...prof, ...tiers];
      setEvents(all);
      setFiltered(all);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFilter() {
    const term = keyword.trim().toLowerCase();
    if (!term) { setFiltered(events); return; }
    setFiltered(events.filter(ev => {
      const content = ev.content?.toLowerCase() || '';
      if (content.includes(term)) return true;
      return ev.tags?.some(t => t[0] === 't' && t[1].toLowerCase().includes(term));
    }));
  }

  return (
    <div>
      <h2>Discover Creators</h2>
      <input value={keyword} placeholder="Filter by tag or keyword" onChange={e => setKeyword(e.target.value)} />
      <button onClick={handleFilter}>Apply</button>
      <ul style={{ paddingLeft: 0 }}>
        {filtered.map(ev => (
          <li key={ev.id} style={{ listStyle: 'none', marginBottom: 10 }}>
            <ProfileCard pubkey={ev.pubkey} />
            {ev.kind === KIND_MVP_TIER && <pre>{ev.content}</pre>}
          </li>
        ))}
      </ul>
    </div>
  );
}
