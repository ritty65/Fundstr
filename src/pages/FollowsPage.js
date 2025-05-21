import React, { useState } from 'react';
import { useNostr } from '../nostr';
import ProfileCard from '../components/ProfileCard';

export default function FollowsPage() {
  const { nostrUser, fetchFollowingList, fetchFollowersList, countFollowing, countFollowers } = useNostr();
  const [targetKey, setTargetKey] = useState('');
  const [following, setFollowing] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [followingCount, setFollowingCount] = useState(null);
  const [followersCount, setFollowersCount] = useState(null);

  async function load() {
    const pk = targetKey || nostrUser?.pk;
    if (!pk) return;
    const fl = await fetchFollowingList(pk);
    const fr = await fetchFollowersList(pk);
    setFollowing(fl);
    setFollowers(fr);
    setFollowingCount(await countFollowing(pk));
    setFollowersCount(await countFollowers(pk));
  }

  return (
    <section>
      <h2>Follower/Following Info</h2>
      <div style={{ marginBottom: 12 }}>
        <input placeholder="Pubkey" value={targetKey} onChange={e => setTargetKey(e.target.value)} />
        <button onClick={load} style={{ marginLeft: 8 }}>Load</button>
      </div>
      <div>
        <h3>Following ({followingCount !== null ? followingCount : following.length})</h3>
        <ul>
          {following.map(pk => (
            <li key={pk}><ProfileCard pubkey={pk} /></li>
          ))}
        </ul>
      </div>
      <div>
        <h3>Followers ({followersCount !== null ? followersCount : followers.length})</h3>
        <ul>
          {followers.map(pk => (
            <li key={pk}><ProfileCard pubkey={pk} /></li>
          ))}
        </ul>
      </div>
    </section>
  );
}
