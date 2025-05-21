import React, { useState } from 'react';
import { NostrProvider } from './nostr';
import Header from './components/Header';
import CreatorSetupPage from './pages/CreatorSetupPage';
import SupportCreatorPage from './pages/SupportCreatorPage';
import MyProfilePage from './pages/MyProfilePage';
import CashuWalletPage from './pages/CashuWalletPage';
import FollowsPage from './pages/FollowsPage';
import ProfileFeedPage from './pages/ProfileFeedPage';

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
        {tab === 'follows' && <FollowsPage />}
        {tab === 'viewer' && <ProfileFeedPage />}
        <footer style={{ marginTop: 64, color: '#888' }}>Nostr Patreon MVP - Demo</footer>
      </div>
    </NostrProvider>
  );
}
