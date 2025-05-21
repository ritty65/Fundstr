import React, { useState } from 'react';
import { NostrProvider } from './nostr';
import Header from './components/Header';
import CreatorSetupPage from './pages/CreatorSetupPage';
import SupportCreatorPage from './pages/SupportCreatorPage';
import DiscoverPage from './pages/DiscoverPage';
import MyProfilePage from './pages/MyProfilePage';

export default function App() {
  const [tab, setTab] = useState('creator');
  return (
    <NostrProvider>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: 32 }}>
        <Header tab={tab} onTab={setTab} />
        {tab === 'creator' && <CreatorSetupPage />}
        {tab === 'supporter' && <SupportCreatorPage />}
        {tab === 'discover' && <DiscoverPage />}
        {tab === 'profile' && <MyProfilePage />}
        <footer style={{ marginTop: 64, color: '#888' }}>Nostr Patreon MVP - Demo</footer>
      </div>
    </NostrProvider>
  );
}
