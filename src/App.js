import React, { useState, useEffect } from 'react';
import { NostrProvider } from './nostr';
import Header from './components/Header';
import CreatorSetupPage from './pages/CreatorSetupPage';
import SupportCreatorPage from './pages/SupportCreatorPage';
import MyProfilePage from './pages/MyProfilePage';
import CashuWalletPage from './pages/CashuWalletPage';
import FollowsPage from './pages/FollowsPage';
import UserActivityPage from './pages/UserActivityPage';
import KeyManagerPage from './pages/KeyManagerPage';

export default function App() {
  const [tab, setTab] = useState('creator');
  const [darkMode, setDarkMode] = useState(() =>
    localStorage.getItem('theme') === 'dark'
  );

  useEffect(() => {
    document.body.dataset.theme = darkMode ? 'dark' : 'light';
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode((m) => !m);
  return (
    <NostrProvider>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: 32 }}>
        <Header tab={tab} onTab={setTab} darkMode={darkMode} onToggleDarkMode={toggleDarkMode} />
        {tab === 'creator' && <CreatorSetupPage />}
        {tab === 'supporter' && <SupportCreatorPage />}
        {tab === 'profile' && <MyProfilePage />}
        {tab === 'wallet' && <CashuWalletPage />}
        {tab === 'follows' && <FollowsPage />}
        {tab === 'activity' && <UserActivityPage />}
        {tab === 'keys' && <KeyManagerPage />}
        <footer style={{ marginTop: 64, color: '#888' }}>Nostr Patreon MVP - Demo</footer>
      </div>
    </NostrProvider>
  );
}
