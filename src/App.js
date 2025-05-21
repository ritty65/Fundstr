import React, { useState } from 'react';
import { NostrProvider } from './nostr';
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
    <NostrProvider>
      <div className="app-container">
        <Header tab={tab} onTab={setTab} />
        {tab === 'creator' && <CreatorSetupPage />}
        {tab === 'supporter' && <SupportCreatorPage />}
        {tab === 'profile' && <MyProfilePage />}
        {tab === 'wallet' && <CashuWalletPage />}
        {tab === 'follows' && <FollowsPage />}
        {tab === 'activity' && <UserActivityPage />}
        <footer>Nostr Patreon MVP - Demo</footer>
      </div>
    </NostrProvider>
  );
}
