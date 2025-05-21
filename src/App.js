import React, { useState } from 'react';
import { NostrProvider } from './nostr';
import { ToastProvider } from './components/ToastProvider';
import Header from './components/Header';
import CreatorSetupPage from './pages/CreatorSetupPage';
import SupportCreatorPage from './pages/SupportCreatorPage';
import MyProfilePage from './pages/MyProfilePage';
import CashuWalletPage from './pages/CashuWalletPage';
import FollowsPage from './pages/FollowsPage';
import UserActivityPage from './pages/UserActivityPage';

export default function App() {
  const [tab, setTab] = useState('creator');
  return (
    <ToastProvider>
      <NostrProvider>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: 32 }}>
          <Header tab={tab} onTab={setTab} />
          {tab === 'creator' && <CreatorSetupPage />}
          {tab === 'supporter' && <SupportCreatorPage />}
          {tab === 'profile' && <MyProfilePage />}
          {tab === 'wallet' && <CashuWalletPage />}
          {tab === 'follows' && <FollowsPage />}
          {tab === 'activity' && <UserActivityPage />}
          <footer style={{ marginTop: 64, color: '#888' }}>Nostr Patreon MVP - Demo</footer>
        </div>
      </NostrProvider>
    </ToastProvider>
  );
}
