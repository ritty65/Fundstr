import React, { useState, useEffect, createContext, useContext } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net"
];
const KIND_PROFILE = 0;
const KIND_MVP_TIER = 30078;
const KIND_MVP_PLEDGE = 30079;

const NostrContext = createContext();

function useNostr() {
  return useContext(NostrContext);
}

// Utility functions using window.NostrTools (from CDN)
function generatePrivateKey() {
  return window.NostrTools.generatePrivateKey();
}
function getPublicKey(sk) {
  return window.NostrTools.getPublicKey(sk);
}
function getEventHash(ev) {
  return window.NostrTools.getEventHash(ev);
}
function signEvent(ev, sk) {
  return window.NostrTools.getSignature(ev, sk);
}
function npubEncode(pk) {
  return window.NostrTools.nip19.npubEncode(pk);
}
function nsecEncode(sk) {
  return window.NostrTools.nip19.nsecEncode(sk);
}

// Decode npub/note/nevent/naddr identifiers to raw values
function decodeNostrIdentifier(value) {
  if (!value) return value;
  if (/^[0-9a-f]{64}$/i.test(value)) return value.toLowerCase();
  try {
    const { type, data } = window.NostrTools.nip19.decode(value);
    switch (type) {
      case 'npub':
        return data; // hex pubkey
      case 'note':
        return data; // event id
      case 'nevent':
        return data.id || data;
      case 'naddr':
        return data; // {kind, pubkey, identifier}
      default:
        return value;
    }
  } catch {
    return value;
  }
}

function saveKeys(sk, pk) {
  localStorage.setItem("nostr_sk", sk);
  localStorage.setItem("nostr_pk", pk);
}
function loadKeys() {
  const sk = localStorage.getItem("nostr_sk");
  const pk = localStorage.getItem("nostr_pk");
  if (sk && pk) return { sk, pk };
  return null;
}
function saveRelays(relays) {
  localStorage.setItem("nostr_relays", JSON.stringify(relays));
}
function loadRelays() {
  try {
    const r = JSON.parse(localStorage.getItem("nostr_relays"));
    if (Array.isArray(r) && r.length) return r;
  } catch {}
  return DEFAULT_RELAYS;
}

function NostrProvider({ children }) {
  const [nostrUser, setNostrUser] = useState(null);
  const [relays, setRelays] = useState(loadRelays());
  const [relayStatus, setRelayStatus] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    const keys = loadKeys();
    if (keys) {
      setNostrUser({
        sk: keys.sk,
        pk: keys.pk,
        npub: npubEncode(keys.pk),
        nsec: nsecEncode(keys.sk)
      });
    }
  }, []);

  useEffect(() => {
    saveRelays(relays);
    checkRelayStatuses(relays);
    // eslint-disable-next-line
  }, [relays]);

  async function checkRelayStatuses(relays) {
    const statuses = {};
    await Promise.all(relays.map(relayUrl =>
      new Promise(resolve => {
        try {
          const ws = new window.WebSocket(relayUrl);
          let settled = false;
          ws.onopen = () => { statuses[relayUrl] = "online"; settled = true; ws.close(); resolve(); };
          ws.onerror = () => { statuses[relayUrl] = "error"; settled = true; ws.close(); resolve(); };
          ws.onclose = () => { if (!settled) { statuses[relayUrl] = "error"; resolve(); } };
          setTimeout(() => { if (!settled) { statuses[relayUrl] = "error"; ws.close(); resolve(); } }, 1500);
        } catch { statuses[relayUrl] = "error"; resolve(); }
      })
    ));
    setRelayStatus(statuses);
  }

  function addRelay(relay) {
    if (relays.includes(relay)) return;
    setRelays([...relays, relay]);
  }
  function removeRelay(relay) {
    setRelays(relays.filter(r => r !== relay));
  }

  function createNewKeypair() {
    try {
      const sk = generatePrivateKey();
      const pk = getPublicKey(sk);
      saveKeys(sk, pk);
      setNostrUser({ sk, pk, npub: npubEncode(pk), nsec: nsecEncode(sk) });
      setError(null);
    } catch (e) {
      setError("Failed to generate keys: " + e.message);
    }
  }

  function logout() {
    localStorage.removeItem("nostr_sk");
    localStorage.removeItem("nostr_pk");
    setNostrUser(null);
    setError(null);
  }

  async function publishNostrEvent(eventTemplate) {
    if (!nostrUser) throw new Error("Generate your keypair first!");
    try {
      const template = {
        ...eventTemplate,
        pubkey: nostrUser.pk,
        created_at: Math.floor(Date.now() / 1000)
      };
      template.id = getEventHash(template);
      template.sig = signEvent(template, nostrUser.sk);

      let errors = [];
      let successes = 0;
      await Promise.all(relays.map(relayUrl =>
        new Promise(resolve => {
          try {
            const ws = new window.WebSocket(relayUrl);
            let isHandled = false;
            ws.onopen = () => {
              ws.send(JSON.stringify(["EVENT", template]));
              setTimeout(() => { if (!isHandled) ws.close(); }, 1000);
            };
            ws.onerror = () => { errors.push(relayUrl); ws.close(); resolve(); };
            ws.onclose = () => resolve();
            ws.onmessage = (e) => { isHandled = true; successes += 1; ws.close(); resolve(); };
          } catch (e) { errors.push(relayUrl); resolve(); }
        })
      ));
      if (successes === 0) throw new Error(errors.join("; "));
      setError(null);
      return template;
    } catch (err) {
      setError("Publish failed: " + err.message);
      throw err;
    }
  }

  async function fetchLatestEvent(pubkey, kind, relayUrl) {
    return new Promise((resolve) => {
      try {
        const ws = new window.WebSocket(relayUrl);
        const subId = Math.random().toString(36).slice(2);
        ws.onopen = () => {
          ws.send(JSON.stringify([
            "REQ", subId,
            { authors: [pubkey], kinds: [kind], limit: 1 }
          ]));
        };
        ws.onmessage = e => {
          const data = JSON.parse(e.data);
          if (data[0] === "EVENT" && data[1] === subId) {
            ws.close();
            resolve(data[2]);
          }
          if (data[0] === "EOSE" && data[1] === subId) {
            ws.close();
            resolve(null);
          }
        };
        ws.onerror = () => { ws.close(); resolve(null); };
      } catch { resolve(null); }
    });
  }
  async function fetchEventsFromRelay(filter, relayUrl) {
    return new Promise((resolve) => {
      try {
        const ws = new window.WebSocket(relayUrl);
        const subId = Math.random().toString(36).slice(2);
        const events = [];
        ws.onopen = () => { ws.send(JSON.stringify(["REQ", subId, filter])); };
        ws.onmessage = e => {
          const data = JSON.parse(e.data);
          if (data[0] === "EVENT" && data[1] === subId) { events.push(data[2]); }
          if (data[0] === "EOSE" && data[1] === subId) { ws.close(); resolve(events); }
        };
        ws.onerror = () => { ws.close(); resolve(events); };
      } catch { resolve([]); }
    });
  }

  // Profile functions
  async function publishProfile(profile) {
    if (!nostrUser) throw new Error("Generate your keypair first!");
    return await publishNostrEvent({
      kind: KIND_PROFILE,
      tags: [],
      content: JSON.stringify(profile)
    });
  }
  async function fetchProfile(pubkey) {
    for (const relay of relays) {
      const event = await fetchLatestEvent(pubkey, KIND_PROFILE, relay);
      if (event) {
        try { return JSON.parse(event.content); } catch { return {}; }
      }
    }
    return {};
  }

  return (
    <NostrContext.Provider value={{
      nostrUser, error, setError, createNewKeypair, logout,
      publishNostrEvent, fetchLatestEvent, fetchEventsFromRelay,
      relays, addRelay, removeRelay, relayStatus,
      publishProfile, fetchProfile
    }}>
      {children}
    </NostrContext.Provider>
  );
}

// --- UI Components ---

function RelayManager() {
  const { relays, addRelay, removeRelay, relayStatus } = useNostr();
  const [newRelay, setNewRelay] = useState("");
  return (
    <section style={{ marginBottom: 24 }}>
      <h3>Relay Management</h3>
      <ul style={{ paddingLeft: 0 }}>
        {relays.map(relay =>
          <li key={relay} style={{ listStyle: "none", marginBottom: 4, display: "flex", alignItems: "center" }}>
            <span style={{
              display: "inline-block",
              width: 10, height: 10,
              borderRadius: "50%",
              marginRight: 6,
              background: relayStatus[relay] === "online" ? "limegreen" : "crimson"
            }}></span>
            <span style={{ flex: 1 }}>{relay}</span>
            <button style={{ fontSize: 13, marginLeft: 10 }} onClick={() => removeRelay(relay)}>Remove</button>
          </li>
        )}
      </ul>
      <div>
        <input
          style={{ minWidth: 230 }}
          placeholder="wss://example.com"
          value={newRelay}
          onChange={e => setNewRelay(e.target.value)}
        />
        <button onClick={() => { if (newRelay) { addRelay(newRelay); setNewRelay(""); } }}>Add Relay</button>
      </div>
    </section>
  );
}

function Header({ onTab, tab }) {
  const { nostrUser, createNewKeypair, logout, error } = useNostr();
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
      <h1>Nostr Patreon MVP</h1>
      <button onClick={() => onTab("creator")}>Creator</button>
      <button onClick={() => onTab("supporter")}>Support a Creator</button>
      <button onClick={() => onTab("discover")}>Discover Creators</button>
      <button onClick={() => onTab("profile")}>My Profile</button>
      <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
        {nostrUser ? (
          <>
            <div style={{ fontSize: "0.8em" }}>
              <strong>npub:</strong> {nostrUser.npub.slice(0, 16)}...<br />
              <strong>nsec:</strong> {nostrUser.nsec.slice(0, 10)}...
              <br /><button style={{ marginTop: 3 }} onClick={logout}>Forget Key</button>
            </div>
          </>
        ) : (
          <button onClick={createNewKeypair}>Create New Key Pair</button>
        )}
        {error && <div style={{ color: "red", fontSize: "0.85em" }}>{error}</div>}
      </div>
    </header>
  );
}

function MyProfilePage() {
  const { nostrUser, publishProfile, fetchProfile, setError } = useNostr();
  const [profile, setProfile] = useState({ name: "", picture: "", about: "" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Load own profile if available
    async function loadProfile() {
      if (nostrUser) {
        try {
          const p = await fetchProfile(nostrUser.pk);
          setProfile({ ...p });
        } catch {}
      }
    }
    loadProfile();
    // eslint-disable-next-line
  }, [nostrUser]);

  async function handlePublish() {
    try {
      setError(null);
      await publishProfile(profile);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      setError("Failed to publish profile: " + e.message);
    }
  }

  return (
    <section>
      <h2>My Profile</h2>
      {!nostrUser && <div style={{ color: "gray" }}>Generate your Nostr key to use profile functions.</div>}
      <input placeholder="Name" value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} disabled={!nostrUser} />
      <input placeholder="Picture URL" value={profile.picture} onChange={e => setProfile({ ...profile, picture: e.target.value })} disabled={!nostrUser} />
      <textarea placeholder="Bio/About" value={profile.about} onChange={e => setProfile({ ...profile, about: e.target.value })} disabled={!nostrUser} />
      <br />
      <button onClick={handlePublish} disabled={!nostrUser}>Publish Profile</button>
      {profile.picture && <div style={{ marginTop: 12 }}><img src={profile.picture} alt="profile" style={{ width: 64, height: 64, borderRadius: "50%" }} /></div>}
      {saved && <div style={{ color: "green" }}>Profile saved to relays!</div>}
    </section>
  );
}

function ProfileCard({ pubkey }) {
  const { fetchProfile } = useNostr();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    async function get() {
      const p = await fetchProfile(pubkey);
      setProfile(p);
    }
    get();
    // eslint-disable-next-line
  }, [pubkey]);

  if (!pubkey) return null;
  return (
    <div style={{ margin: "16px 0", border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
      <div style={{ fontWeight: 700 }}>User: {npubEncode(pubkey).slice(0, 14)}...</div>
      {profile && (
        <div>
          {profile.picture && <img src={profile.picture} alt="" style={{ width: 36, borderRadius: "50%", margin: 6 }} />}
          {profile.name && <div><b>Name:</b> {profile.name}</div>}
          {profile.about && <div><b>Bio:</b> {profile.about}</div>}
        </div>
      )}
    </div>
  );
}

function CreatorSetupPage() {
  const { nostrUser, publishNostrEvent, fetchLatestEvent, fetchEventsFromRelay, setError } = useNostr();
  const [tier, setTier] = useState({ title: "", amount: "", paymentInstructions: "" });
  const [currentTier, setCurrentTier] = useState(null);
  const [supporters, setSupporters] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!nostrUser) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const latestTier = await fetchLatestEvent(nostrUser.pk, KIND_MVP_TIER, DEFAULT_RELAYS[0]);
        setCurrentTier(latestTier ? JSON.parse(latestTier.content) : null);
        if (latestTier) {
          const pledges = await fetchEventsFromRelay({ kinds: [KIND_MVP_PLEDGE], "#p": [nostrUser.pk] }, DEFAULT_RELAYS[0]);
          setSupporters(pledges);
        }
      } catch (e) {
        setError("Failed to load creator data.");
      }
      setLoading(false);
    })();
    // eslint-disable-next-line
  }, [nostrUser]);

  async function handlePublishTier() {
    if (!nostrUser) return alert("Generate your key pair first");
    try {
      setError(null);
      const event = {
        kind: KIND_MVP_TIER,
        tags: [['d', 'mvp-creator-tier']],
        content: JSON.stringify({ ...tier, currency: "BTC" })
      };
      await publishNostrEvent(event);
      alert("Tier published!");
    } catch (e) {
      setError("Failed to publish: " + e.message);
    }
  }

  return (
    <div>
      <RelayManager />
      <h2>Creator Setup</h2>
      {!nostrUser && <div style={{ color: "gray" }}>Generate or load your Nostr key to use creator functions.</div>}
      <div>
        <input placeholder="Tier Title" value={tier.title} onChange={e => setTier({ ...tier, title: e.target.value })} disabled={!nostrUser} />
        <input placeholder="Amount (in sats)" type="number" value={tier.amount} onChange={e => setTier({ ...tier, amount: e.target.value })} disabled={!nostrUser} />
        <input placeholder="Payment Instructions (e.g., BTC address)" value={tier.paymentInstructions} onChange={e => setTier({ ...tier, paymentInstructions: e.target.value })} disabled={!nostrUser} />
        <input value="BTC" readOnly style={{ width: 64 }} title="Only BTC allowed" />
        <button onClick={handlePublishTier} disabled={!nostrUser}>Publish Tier</button>
      </div>
      <h3>Current Tier</h3>
      <pre>{currentTier ? JSON.stringify(currentTier, null, 2) : "None"}</pre>
      {currentTier?.paymentInstructions && <QRCodeSVG value={currentTier.paymentInstructions} />}
      <h3>Supporters</h3>
      {loading ? "Loading..." : (
        <ul>
          {supporters.map(ev => (
            <li key={ev.id}>
              <ProfileCard pubkey={ev.pubkey} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SupportCreatorPage() {
  const { nostrUser, publishNostrEvent, fetchLatestEvent } = useNostr();
  const [creatorKey, setCreatorKey] = useState("");
  const [creatorProfile, setCreatorProfile] = useState(null);
  const [tier, setTier] = useState(null);
  const [error, setError] = useState(null);

  async function handleFetchCreatorTier() {
    setError(null);
    if (!creatorKey) return;
    try {
      const hexKey = decodeNostrIdentifier(creatorKey);
      const tierEvent = await fetchLatestEvent(hexKey, KIND_MVP_TIER, DEFAULT_RELAYS[0]);
      if (!tierEvent) { setTier(null); setError("No tier found for this pubkey."); return; }
      setTier(JSON.parse(tierEvent.content));
      const profEvent = await fetchLatestEvent(hexKey, KIND_PROFILE, DEFAULT_RELAYS[0]);
      if (profEvent) {
        try { setCreatorProfile(JSON.parse(profEvent.content)); } catch { }
      }
    } catch {
      setError("Could not fetch creator data.");
    }
  }

  async function handlePledgeSupport() {
    if (!nostrUser || !tier) { setError("Generate your keypair and load a tier."); return; }
    try {
      setError(null);
      const event = {
        kind: KIND_MVP_PLEDGE,
        tags: [
          ["p", decodeNostrIdentifier(creatorKey)],
          ["e", tier.id || ""]
        ],
        content: "I pledge support"
      };
      await publishNostrEvent(event);
      alert("Pledge published!");
    } catch (e) {
      setError("Failed to pledge: " + e.message);
    }
  }

  return (
    <div>
      <RelayManager />
      <h2>Support a Creator</h2>
      <input placeholder="Creator Pubkey" value={creatorKey} onChange={e => setCreatorKey(e.target.value)} />
      <button onClick={handleFetchCreatorTier}>Find Tier</button>
      {creatorProfile && (
        <ProfileCard pubkey={decodeNostrIdentifier(creatorKey)} />
      )}
      {tier && (
        <div>
          <h3>Tier</h3>
          <pre>{JSON.stringify(tier, null, 2)}</pre>
          {tier.paymentInstructions && <QRCodeSVG value={tier.paymentInstructions} />}
          <button onClick={handlePledgeSupport}>Pledge Support (Mock)</button>
        </div>
      )}
      {error && <div style={{ color: "red" }}>{error}</div>}
    </div>
  );
}

function DiscoverCreatorsPage() {
  const { fetchEventsFromRelay } = useNostr();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  async function handleSearch() {
    setLoading(true);
    const events = await fetchEventsFromRelay({ kinds: [KIND_PROFILE], limit: 200 }, DEFAULT_RELAYS[0]);
    const q = query.toLowerCase();
    const matches = events.filter(ev => {
      try {
        const p = JSON.parse(ev.content);
        return (p.name && p.name.toLowerCase().includes(q)) || (p.about && p.about.toLowerCase().includes(q));
      } catch {
        return false;
      }
    }).map(ev => ev.pubkey);
    setResults(matches);
    setLoading(false);
  }

  return (
    <div>
      <RelayManager />
      <h2>Discover Creators</h2>
      <input placeholder="Search by name or bio" value={query} onChange={e => setQuery(e.target.value)} />
      <button onClick={handleSearch}>Search</button>
      {loading ? "Searching..." : (
        <div>
          {results.map(pk => (
            <ProfileCard key={pk} pubkey={pk} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("creator");
  return (
    <NostrProvider>
      <div style={{ maxWidth: 800, margin: "0 auto", padding: 32 }}>
        <Header tab={tab} onTab={setTab} />
        {tab === "creator" && <CreatorSetupPage />}
        {tab === "supporter" && <SupportCreatorPage />}
        {tab === "discover" && <DiscoverCreatorsPage />}
        {tab === "profile" && <MyProfilePage />}
        <footer style={{ marginTop: 64, color: "#888" }}>Nostr Patreon MVP - Demo</footer>
      </div>
    </NostrProvider>
  );
}
