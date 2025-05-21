import React, { useState, useEffect } from 'react';
import { useNostr } from '../nostr';
import ProfileCard from '../components/ProfileCard';

export default function ProfileFeedPage() {
  const {
    fetchProfile,
    fetchFollowingList,
    fetchFollowersList,
    fetchEventsFromRelay,
    relays
  } = useNostr();

  const [identifier, setIdentifier] = useState('');
  const [pubkey, setPubkey] = useState('');
  const [tab, setTab] = useState('profile');
  const [profile, setProfile] = useState(null);
  const [notes, setNotes] = useState([]);
  const [articles, setArticles] = useState([]);
  const [following, setFollowing] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function resolveIdentifier(id) {
    if (!id) return null;
    if (id.startsWith('npub')) {
      try { return window.NostrTools.nip19.decode(id).data; } catch {}
    }
    if (id.includes('@')) {
      try {
        const [name, domain] = id.split('@');
        const res = await fetch(`https://${domain}/.well-known/nostr.json?name=${name}`);
        const json = await res.json();
        return json.names?.[name] || null;
      } catch {}
    }
    return id;
  }

  async function load() {
    setError(null);
    const pk = await resolveIdentifier(identifier.trim());
    if (!pk) { setError('Could not resolve identifier'); return; }
    setPubkey(pk);
  }

  useEffect(() => {
    if (!pubkey) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const p = await fetchProfile(pubkey);
        setProfile(p);
        const fl = await fetchFollowingList(pubkey);
        const fr = await fetchFollowersList(pubkey);
        setFollowing(fl);
        setFollowers(fr);
        let ns = [];
        for (const r of relays) {
          const evs = await fetchEventsFromRelay({ authors: [pubkey], kinds: [1], limit: 20 }, r);
          if (evs.length) ns.push(...evs);
        }
        ns.sort((a, b) => b.created_at - a.created_at);
        setNotes(ns);
        let arts = [];
        for (const r of relays) {
          const evs = await fetchEventsFromRelay({ authors: [pubkey], kinds: [30023], limit: 10 }, r);
          if (evs.length) arts.push(...evs);
        }
        arts.sort((a, b) => b.created_at - a.created_at);
        setArticles(arts);
        let acts = [];
        for (const r of relays) {
          const evs = await fetchEventsFromRelay({ authors: [pubkey], limit: 20 }, r);
          if (evs.length) acts.push(...evs);
        }
        acts.sort((a, b) => b.created_at - a.created_at);
        setActivity(acts);
      } catch {
        setError('Failed to load user data');
      }
      setLoading(false);
    })();
  }, [pubkey]);

  return (
    <section>
      <h2>Profile Feed Viewer</h2>
      <div style={{ marginBottom: 12 }}>
        <input
          placeholder="npub or NIP-05"
          value={identifier}
          onChange={e => setIdentifier(e.target.value)}
        />
        <button onClick={load} style={{ marginLeft: 8 }}>Load</button>
      </div>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      {loading && <div>Loading...</div>}
      {pubkey && !loading && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <button onClick={() => setTab('profile')}>Profile</button>
            <button onClick={() => setTab('notes')}>Notes</button>
            <button onClick={() => setTab('articles')}>Articles</button>
            <button onClick={() => setTab('following')}>Following</button>
            <button onClick={() => setTab('followers')}>Followers</button>
            <button onClick={() => setTab('activity')}>Activity</button>
          </div>
          {tab === 'profile' && (
            <div>
              <ProfileCard pubkey={pubkey} />
              {profile && <pre>{JSON.stringify(profile, null, 2)}</pre>}
            </div>
          )}
          {tab === 'notes' && (
            <ul>
              {notes.map(ev => (
                <li key={ev.id}>{ev.content}</li>
              ))}
            </ul>
          )}
          {tab === 'articles' && (
            <ul>
              {articles.map(ev => (
                <li key={ev.id}>{ev.content.slice(0, 100)}...</li>
              ))}
            </ul>
          )}
          {tab === 'following' && (
            <ul>
              {following.map(pk => (
                <li key={pk}><ProfileCard pubkey={pk} /></li>
              ))}
            </ul>
          )}
          {tab === 'followers' && (
            <ul>
              {followers.map(pk => (
                <li key={pk}><ProfileCard pubkey={pk} /></li>
              ))}
            </ul>
          )}
          {tab === 'activity' && (
            <ul>
              {activity.map(ev => (
                <li key={ev.id}>{ev.kind} - {ev.content.slice(0, 80)}...</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
