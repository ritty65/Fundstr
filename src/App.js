import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { NostrProvider } from './nostr';
import Header from './components/Header';
import CreatorSetupPage from './pages/CreatorSetupPage';
import SupportCreatorPage from './pages/SupportCreatorPage';
import MyProfilePage from './pages/MyProfilePage';
import CashuWalletPage from './pages/CashuWalletPage';
import FollowsPage from './pages/FollowsPage';
import UserActivityPage from './pages/UserActivityPage';

export default function App() {
  return (
    <NostrProvider>
      <Router>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: 32 }}>
          <Header />
          <Routes>
            <Route path="/" element={<CreatorSetupPage />} />
            <Route path="/creator" element={<CreatorSetupPage />} />
            <Route path="/supporter" element={<SupportCreatorPage />} />
            <Route path="/profile" element={<MyProfilePage />} />
            <Route path="/wallet" element={<CashuWalletPage />} />
            <Route path="/follows" element={<FollowsPage />} />
            <Route path="/activity" element={<UserActivityPage />} />
          </Routes>
          <footer style={{ marginTop: 64, color: '#888' }}>Nostr Patreon MVP - Demo</footer>
        </div>
      </Router>
    </NostrProvider>
  );
}
