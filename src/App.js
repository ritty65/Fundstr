import React, { useState, useEffect, createContext, useContext } from 'react';
import { QRCodeSVG } from 'qrcode.react';

// SVG Icon Definitions (using currentColor for stroke/fill)
const ICON_USER_PLUS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="17" y1="11" x2="23" y2="11"></line></svg>`;
const ICON_HEART = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;
const ICON_SEARCH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;
const ICON_USER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
const ICON_WALLET = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V8H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h12v4"></path><path d="M18 12a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-2z"></path><path d="M4 20V10c0-2.2 1.8-4 4-4h6"></path></svg>`; // Simplified wallet
const ICON_USERS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`;
const ICON_ACTIVITY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>`;
const ICON_KEY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>`;
const ICON_LOGOUT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>`;
const ICON_SUN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
const ICON_MOON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
const ICON_MENU = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`;
const ICON_GENERIC_USER = ICON_USER; // Using the same user icon for placeholder

// Icon Component
function Icon({ svgContent, size = 18, className = "", ...props }) { // Default size 18
  return (
    <span
      {...props}
      className={`icon-span ${className}`} // Added className prop
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, marginRight: '0.4em', flexShrink: 0 }} // Added flexShrink
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
}

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

  const getRelayStatusClass = (status) => {
    if (status === "online") return "online";
    if (status === "error") return "error";
    return "unknown"; // Default or unknown status
  };

  return (
    <div className="content-card">
      <h3>Relay Management</h3>
      {relays.length > 0 && (
        <ul className="list-reset" style={{ marginBottom: 'var(--spacing-md)' }}>
          {relays.map(relay => (
            <li key={relay} className="list-item">
              <span className={`status-dot ${getRelayStatusClass(relayStatus[relay])}`}></span>
              <span className="list-item-content">{relay}</span>
              <button
                onClick={() => removeRelay(relay)}
                className="button-minimal"
                // Consider if padding needs to be adjusted or if button-minimal is sufficient
                // style={{ padding: 'var(--spacing-xs) var(--spacing-sm)' }} 
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="form-group">
        <label htmlFor="newRelayUrl">Add New Relay (wss://)</label>
        <input
          type="text"
          id="newRelayUrl"
          placeholder="wss://example.com"
          value={newRelay}
          onChange={e => setNewRelay(e.target.value)}
        />
      </div>
      <button onClick={() => { if (newRelay) { addRelay(newRelay); setNewRelay(""); } }} className="button-secondary">Add Relay</button>
    </div>
  );
}

function Header({ onTab, tab, theme, toggleTheme }) {
  const { nostrUser, createNewKeypair, logout, error, fetchProfile } = useNostr();
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // Hamburger menu state

  useEffect(() => {
    async function loadProfilePic() {
      if (nostrUser && nostrUser.pk) {
        try {
          const profile = await fetchProfile(nostrUser.pk);
          setUserProfile(profile);
        } catch (e) {
          console.error("Failed to fetch profile for avatar", e);
        }
      } else {
        setUserProfile(null);
      }
    }
    loadProfilePic();
  }, [nostrUser, fetchProfile]);

  const navTabs = [
    { key: "creator", label: "Creator", icon: ICON_USER_PLUS },
    { key: "supporter", label: "Support", icon: ICON_HEART },
    { key: "discover", label: "Discover", icon: ICON_SEARCH },
    { key: "profile", label: "My Profile", icon: ICON_USER },
    { key: "wallet", label: "Cashu Wallet", icon: ICON_WALLET },
    { key: "follows", label: "Follows", icon: ICON_USERS },
    { key: "activity", label: "Activity", icon: ICON_ACTIVITY },
  ];

  return (
    <header className="app-header">
      <div className="logo-container">
        <img src="logo.svg" alt="Fundstr Logo" className="logo-img" />
        <span className="logo-text">Fundstr</span>
      </div>

      <button className="hamburger-button" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
        <Icon svgContent={ICON_MENU} size={24} />
      </button>

      <nav className={`header-nav ${isMobileMenuOpen ? 'mobile-hidden' : ''}`}>
        {navTabs.map(navItem => (
          <button
            key={navItem.key}
            className={`nav-tab ${tab === navItem.key ? 'active' : ''}`}
            onClick={() => { onTab(navItem.key); setIsMobileMenuOpen(false); }}
            title={navItem.label} // Add title for accessibility on icon-only view (though we have text)
          >
            <Icon svgContent={navItem.icon} /> {navItem.label}
          </button>
        ))}
      </nav>

      {isMobileMenuOpen && (
        <div className="mobile-nav-menu">
          {navTabs.map(navItem => (
            <button
              key={navItem.key}
              className={`nav-tab mobile-nav-tab ${tab === navItem.key ? 'active' : ''}`}
              onClick={() => { onTab(navItem.key); setIsMobileMenuOpen(false); }}
            >
              <Icon svgContent={navItem.icon} /> {navItem.label}
            </button>
          ))}
        </div>
      )}

      <div className="auth-section">
        {nostrUser ? (
          <div className="user-menu-container">
            <button onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)} className="avatar-button">
              {userProfile && userProfile.picture ? (
                <img src={userProfile.picture} alt="User Avatar" className="user-avatar-img" />
              ) : (
                <div className="user-avatar-placeholder">
                  {/* Using an Icon for generic user avatar if no picture and no name initials */}
                  {userProfile && userProfile.name ? userProfile.name.substring(0, 1).toUpperCase() : <Icon svgContent={ICON_GENERIC_USER} size={20} className="avatar-icon-placeholder" />}
                </div>
              )}
            </button>
            {isUserDropdownOpen && (
              <div className="user-dropdown">
                <div className="dropdown-user-info">
                  <p><strong>{userProfile?.name || nostrUser.npub.slice(0,12) + "..."}</strong></p>
                  <p className="npub-display">{nostrUser.npub.slice(0,24)}...</p>
                </div>
                <button className="user-dropdown-item" onClick={() => { onTab('profile'); setIsUserDropdownOpen(false); }}>
                  <Icon svgContent={ICON_USER} /> My Profile
                </button>
                <button className="user-dropdown-item" onClick={() => { alert('Key Manager clicked - Placeholder'); setIsUserDropdownOpen(false); }}>
                  <Icon svgContent={ICON_KEY} /> Key Manager
                </button>
                <button onClick={() => { toggleTheme(); setIsUserDropdownOpen(false); }} className="user-dropdown-item theme-toggle-button">
                  <Icon svgContent={theme === 'light' ? ICON_MOON : ICON_SUN} /> Switch to {theme === 'light' ? 'Dark' : 'Light'} Mode
                </button>
                <button className="user-dropdown-item" onClick={() => { logout(); setIsUserDropdownOpen(false); }}>
                  <Icon svgContent={ICON_LOGOUT} /> Logout
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <button className="auth-button button-primary">Login with Extension</button>
            <button className="auth-button button-secondary" onClick={createNewKeypair}>
              Login with Private Key
            </button>
          </>
        )}
        {error && <div className="header-error-display">{error.message || String(error)}</div>}
      </div>
    </header>
  );
}

function MyProfilePage() {
  const { nostrUser, publishProfile, fetchProfile, setError, relays } = useNostr(); // Added relays
  const [profile, setProfile] = useState({ name: "", picture: "", about: "" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      if (nostrUser && nostrUser.pk) { // Check nostrUser.pk
        try {
          // Fetch profile from multiple relays for robustness
          let p = null;
          for (const relayUrl of relays) { // Using relays from useNostr()
             p = await fetchLatestEvent(nostrUser.pk, KIND_PROFILE, relayUrl); // Using fetchLatestEvent
             if (p) {
                try {
                    setProfile(JSON.parse(p.content));
                } catch (e) { console.error("Error parsing profile content from relay", relayUrl, e); }
                break; // Found profile, exit loop
             }
          }
          if (!p) setProfile({ name: "", picture: "", about: "" }); // Reset if not found

        } catch (e) {
          console.error("Failed to load profile", e);
          setProfile({ name: "", picture: "", about: "" }); // Reset on error
        }
      } else {
        setProfile({ name: "", picture: "", about: "" }); // Clear profile if no user or pk
      }
    }
    loadProfile();
    // eslint-disable-next-line
  }, [nostrUser, fetchLatestEvent, relays]); // Updated dependencies, fetchProfile was not directly used here before

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
    <div className="content-card">
      <h2>My Profile</h2>
      {!nostrUser && <p style={{ color: "var(--text-color)", opacity: 0.7 }}>Generate or load your Nostr key to use profile functions.</p>}
      
      <div className="form-group">
        <label htmlFor="profileName">Name</label>
        <input type="text" id="profileName" placeholder="Your display name" value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} disabled={!nostrUser} />
      </div>
      
      <div className="form-group">
        <label htmlFor="profilePictureUrl">Picture URL</label>
        <input type="url" id="profilePictureUrl" placeholder="https://example.com/image.png" value={profile.picture} onChange={e => setProfile({ ...profile, picture: e.target.value })} disabled={!nostrUser} />
      </div>
      
      <div className="form-group">
        <label htmlFor="profileAbout">Bio/About</label>
        <textarea id="profileAbout" placeholder="Tell us about yourself" value={profile.about} onChange={e => setProfile({ ...profile, about: e.target.value })} disabled={!nostrUser} />
      </div>
      
      <button onClick={handlePublish} disabled={!nostrUser} className="button-primary">Publish Profile</button>
      
      {profile.picture && (
        <div style={{ marginTop: 'var(--spacing-lg)' }}>
          <label>Current Picture:</label>
          <img src={profile.picture} alt="Profile preview" style={{ width: 80, height: 80, borderRadius: "50%", border: `2px solid var(--border-color)`, marginTop: 'var(--spacing-xs)' }} />
        </div>
      )}
      {saved && <p style={{ color: "green", marginTop: 'var(--spacing-md)' }}>Profile saved to relays!</p>}
    </div>
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
    if (pubkey) get(); // Ensure pubkey exists before fetching
    // eslint-disable-next-line
  }, [pubkey, fetchProfile]); // Added fetchProfile to dependencies

  if (!pubkey) return null;
  // This component is used within a list in CreatorSetupPage, could be a simple list item or a small card itself.
  // For now, keeping its existing styling for differentiation, but it could also become a .content-card if desired.
  return (
    <li style={{ listStyleType: 'none', border: `1px solid var(--border-color)`, borderRadius: 'var(--border-radius-md)', padding: 'var(--spacing-md)', marginBottom: 'var(--spacing-sm)' }}>
      <div style={{ fontWeight: 'var(--font-weight-semibold)' }}>User: {npubEncode(pubkey).slice(0, 14)}...</div>
      {profile ? (
        <div>
          {profile.picture && <img src={profile.picture} alt={profile.name || 'User avatar'} style={{ width: 36, height:36, borderRadius: "50%", margin: 'var(--spacing-sm) 0' }} />}
          {profile.name && <div><b>Name:</b> {profile.name}</div>}
          {profile.about && <div style={{fontSize: '0.9em', opacity: 0.8}}><b>Bio:</b> {profile.about}</div>}
        </div>
      ) : <p>Loading profile...</p>}
    </li>
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
    <> {/* Using Fragment to avoid unnecessary div */}
      <RelayManager />

      <div className="content-card">
        <h2>Creator Setup</h2>
        {!nostrUser && <p style={{ color: "var(--text-color)", opacity: 0.7 }}>Generate or load your Nostr key to use creator functions.</p>}
        
        <div className="form-group">
          <label htmlFor="tierTitle">Tier Title</label>
          <input type="text" id="tierTitle" placeholder="E.g., Gold Supporter" value={tier.title} onChange={e => setTier({ ...tier, title: e.target.value })} disabled={!nostrUser} />
        </div>
        
        <div className="form-group">
          <label htmlFor="tierAmount">Amount (in sats)</label>
          <input type="number" id="tierAmount" placeholder="5000" value={tier.amount} onChange={e => setTier({ ...tier, amount: e.target.value })} disabled={!nostrUser} />
        </div>
        
        <div className="form-group">
          <label htmlFor="tierPaymentInstructions">Payment Instructions (e.g., BTC Lightning Address or On-chain Address)</label>
          <input type="text" id="tierPaymentInstructions" placeholder="lnbc..." value={tier.paymentInstructions} onChange={e => setTier({ ...tier, paymentInstructions: e.target.value })} disabled={!nostrUser} />
        </div>
        
        <div className="form-group">
          <label htmlFor="tierCurrency">Currency</label>
          <input type="text" id="tierCurrency" value="BTC" readOnly style={{ width: '100px' }} title="Only BTC allowed for now" />
        </div>
        
        <button onClick={handlePublishTier} disabled={!nostrUser} className="button-primary">Publish Tier</button>
      </div>

      {currentTier && (
        <div className="content-card">
          <h3>Current Tier</h3>
          <pre style={{whiteSpace: 'pre-wrap', wordBreak: 'break-all'}}>{JSON.stringify(currentTier, null, 2)}</pre> {/* Removed "None" string */}
          {currentTier?.paymentInstructions && <QRCodeSVG value={currentTier.paymentInstructions} size={128} style={{marginTop: 'var(--spacing-md)'}} />}
        </div>
      )}

      <div className="content-card">
        <h3>Supporters</h3>
        {loading ? <p>Loading...</p> : (
          supporters.length > 0 ? (
            <ul className="list-reset"> {/* Applied list-reset */}
              {supporters.map(ev => (
                <ProfileCard key={ev.id} pubkey={ev.pubkey} /> 
              ))}
            </ul>
          ) : <p>No supporters yet.</p>
        )}
      </div>
    </>
  );
}

// Placeholder Page Components
function DiscoverPage() {
  return (
    <div className="content-card">
      <h2>Discover Creators & Content</h2>
      <p>Explore new creators, popular tiers, and interesting content across the Nostr network. This section will feature tools for discovery and recommendations.</p>
    </div>
  );
}

function CashuWalletPage() {
  // Basic placeholder, assuming useNostr might be used later for wallet interactions
  // const { nostrUser } = useNostr(); 
  return (
    <div className="content-card">
      <h2>Cashu Wallet</h2>
      <p>Manage your Cashu ecash, view balances, send, and receive payments. Integration with your Nostr identity for seamless creator support is planned.</p>
      <p style={{marginTop: 'var(--spacing-md)'}}><em>(Full wallet functionality is under development.)</em></p>
      {/* 
        Placeholder for future wallet UI elements:
        - Balance display
        - Send/Receive buttons
        - Transaction history 
      */}
    </div>
  );
}

function FollowsPage() {
  return (
    <div className="content-card">
      <h2>Followed Creators & Activity</h2>
      <p>See updates from creators you follow, including new tiers, posts, or special content. This feed will help you stay connected with your favorite Nostr personalities.</p>
    </div>
  );
}

function ActivityPage() {
  return (
    <div className="content-card">
      <h2>Recent Activity & Notifications</h2>
      <p>Track your support pledges, incoming payments (for creators), and other important notifications related to your Fundstr activity.</p>
    </div>
  );
}
// End Placeholder Page Components

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
      const tierEvent = await fetchLatestEvent(creatorKey, KIND_MVP_TIER, DEFAULT_RELAYS[0]);
      if (!tierEvent) { setTier(null); setError("No tier found for this pubkey."); return; }
      setTier(JSON.parse(tierEvent.content));
      const profEvent = await fetchLatestEvent(creatorKey, KIND_PROFILE, DEFAULT_RELAYS[0]);
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
          ["p", creatorKey],
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
    <> {/* Using Fragment to avoid unnecessary div */}
      <RelayManager />
      <div className="content-card">
        <h2>Support a Creator</h2>
        <div className="form-group">
          <label htmlFor="creatorKey">Creator's Nostr Public Key (hex or npub)</label>
          <input type="text" id="creatorKey" placeholder="Enter creator's npub or hex public key" value={creatorKey} onChange={e => setCreatorKey(e.target.value)} />
        </div>
        <button onClick={handleFetchCreatorTier} className="button-primary">Find Tier</button>
        
        {creatorProfile && (
          <div className="content-card" style={{marginTop: 'var(--spacing-lg)'}}>
             <h4>Creator Profile</h4>
             <ProfileCard pubkey={creatorKey} />
          </div>
        )}
      </div>

      {tier && (
        <div className="content-card">
          <h3>Tier Details</h3>
          <pre style={{whiteSpace: 'pre-wrap', wordBreak: 'break-all'}}>{JSON.stringify(tier, null, 2)}</pre>
          {tier.paymentInstructions && <QRCodeSVG value={tier.paymentInstructions} size={128} style={{marginTop: 'var(--spacing-md)'}} />}
          <button onClick={handlePledgeSupport} disabled={!nostrUser} className="button-accent" style={{marginTop: 'var(--spacing-md)'}}>
            Pledge Support (Mock)
          </button>
        </div>
      )}
      {error && <p style={{ color: "red", marginTop: 'var(--spacing-md)' }}>{error}</p>}
    </>
  );
}

export default function App() {
  const [tab, setTab] = useState("creator");
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  // Determine the main content wrapper class based on the current tab
  // This allows for specific styling or layout for the overall content area if needed in the future
  const mainContentContainerClass = `main-content-area tab-${tab}`;


  return (
    <NostrProvider>
      {/* The div below #root in styles.css has max-width: 1200px; margin: 0 auto; padding: var(--spacing-xl); */}
      {/* This existing div acts as the main container for the pages. */}
      <div className={mainContentContainerClass} style={{ maxWidth: 800, margin: "0 auto", padding: 'var(--spacing-xl)' /* Using CSS var for padding */ }}>
        <Header tab={tab} onTab={setTab} theme={theme} toggleTheme={toggleTheme} />
        {tab === "creator" && <CreatorSetupPage />}
        {tab === "supporter" && <SupportCreatorPage />}
        {tab === "profile" && <MyProfilePage />}
        {tab === "discover" && <DiscoverPage />}
        {tab === "wallet" && <CashuWalletPage />} 
        {tab === "follows" && <FollowsPage />}
        {tab === "activity" && <ActivityPage />}
        <footer style={{ marginTop: 'var(--spacing-xxl)', color: "var(--text-color)", opacity: 0.7, textAlign: 'center', fontSize: 'var(--font-size-small)' }}>Fundstr - A Nostr-based creator support platform.</footer>
      </div>
    </NostrProvider>
  );
}
