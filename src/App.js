import React, { useState } from 'react';
import { NostrProvider } from './nostr';
import Header from './components/Header';
import CreatorSetupPage from './pages/CreatorSetupPage';
import SupportCreatorPage from './pages/SupportCreatorPage';
import MyProfilePage from './pages/MyProfilePage';
import CashuWalletPage from './pages/CashuWalletPage';

export default function App() {
  const [tab, setTab] = useState('creator');
  return (
    <NostrProvider>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: 32 }}>
        <Header tab={tab} onTab={setTab} />
        {tab === 'creator' && <CreatorSetupPage />}
        {tab === 'supporter' && <SupportCreatorPage />}
        {tab === 'profile' && <MyProfilePage />}
        {tab === 'wallet' && <CashuWalletPage />}
        <footer style={{ marginTop: 64, color: '#888' }}>Nostr Patreon MVP - Demo</footer>
      </div>
    </NostrProvider>
  );
}
