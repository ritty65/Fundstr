import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useNostr, DEFAULT_RELAYS, KIND_MVP_TIER, KIND_PROFILE, KIND_MVP_PLEDGE, KIND_RECURRING_PLEDGE } from '../nostr';
import RelayManager from '../components/RelayManager';
import ProfileCard from '../components/ProfileCard';
import { useToast } from '../components/ToastProvider';
import InvoiceModal from '../components/InvoiceModal';

export default function SupportCreatorPage() {
  const {
    nostrUser,
    publishNostrEvent,
    fetchLatestEvent,
    fetchEventsFromRelay,
    fetchCashuTokens,
    sendCashuToken,
    nwc,
    connectNwc,
    sendNwcPayInvoice
  } = useNostr();
  const { addToast } = useToast();
  const [creatorKey, setCreatorKey] = useState('');
  const [creatorProfile, setCreatorProfile] = useState(null);
  const [tier, setTier] = useState(null);
  const [error, setError] = useState(null);
  const [nwcUri, setNwcUri] = useState('');
  const [recurrings, setRecurrings] = useState([]);
  const [duePledges, setDuePledges] = useState([]);
  const [recurringAmount, setRecurringAmount] = useState('');
  const [period, setPeriod] = useState('weekly');
  const [note, setNote] = useState('');
  const [cashuTokens, setCashuTokens] = useState([]);
  const [invoiceModal, setInvoiceModal] = useState(null);

  useEffect(() => {
    if (!nostrUser) { setRecurrings([]); return; }
    (async () => {
      try {
        const evs = await fetchEventsFromRelay({ authors: [nostrUser.pk], kinds: [KIND_RECURRING_PLEDGE] }, DEFAULT_RELAYS[0]);
        setRecurrings(evs);
      } catch {}
    })();
  }, [nostrUser]);

  useEffect(() => {
    if (!nostrUser) { setCashuTokens([]); return; }
    (async () => {
      try {
        const ts = await fetchCashuTokens(nostrUser.pk);
        setCashuTokens(ts);
      } catch {}
    })();
  }, [nostrUser]);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const due = recurrings.filter(ev => {
        const next = parseInt(ev.tags.find(t => t[0] === 'next_payment_due')?.[1] || '0');
        const status = ev.tags.find(t => t[0] === 'status')?.[1];
        return status === 'active' && next <= now;
      });
      setDuePledges(due);
    }, 10000);
    return () => clearInterval(id);
  }, [recurrings]);

  async function handlePayPledge(ev) {
    const creator = ev.tags.find(t => t[0] === 'p')?.[1];
    const amount = parseInt(ev.tags.find(t => t[0] === 'amount')?.[1] || '0');
    if (!creator) return;
    try {
      const tierEv = await fetchLatestEvent(creator, KIND_MVP_TIER, DEFAULT_RELAYS[0]);
      if (!tierEv) throw new Error('tier not found');
      const tierData = JSON.parse(tierEv.content);
      if (nwc) {
        await sendNwcPayInvoice(tierData.paymentInstructions, amount);
        addToast('Payment request sent to wallet', 'success');
      } else {
        setInvoiceModal(tierData.paymentInstructions);
      }
    } catch {
      addToast('Could not process payment', 'danger');
    }
  }

  async function handlePayPledgeCashu(ev) {
    const creator = ev.tags.find(t => t[0] === 'p')?.[1];
    if (!creator || cashuTokens.length === 0) return;
    try {
      const token = cashuTokens[0];
      await sendCashuToken(token, creator);
      addToast('Cashu token sent', 'success');
      setCashuTokens(cashuTokens.filter(t => t.id !== token.id));
    } catch {
      addToast('Could not send token', 'danger');
    }
  }

  async function handleFetchCreatorTier() {
    setError(null);
    if (!creatorKey) return;
    try {
      const tierEvent = await fetchLatestEvent(creatorKey, KIND_MVP_TIER, DEFAULT_RELAYS[0]);
      if (!tierEvent) { setTier(null); setError('No tier found for this pubkey.'); return; }
      setTier(JSON.parse(tierEvent.content));
      const profEvent = await fetchLatestEvent(creatorKey, KIND_PROFILE, DEFAULT_RELAYS[0]);
      if (profEvent) {
        try { setCreatorProfile(JSON.parse(profEvent.content)); } catch { }
      }
    } catch {
      setError('Could not fetch creator data.');
    }
  }

  async function handlePledgeSupport() {
    if (!nostrUser || !tier) { setError('Connect your Nostr extension and load a tier.'); return; }
    try {
      setError(null);
      const event = {
        kind: KIND_MVP_PLEDGE,
        tags: [
          ['p', creatorKey],
          ['e', tier.id || '']
        ],
        content: 'I pledge support'
      };
      await publishNostrEvent(event);
      addToast('Pledge published!', 'success');
    } catch (e) {
      setError('Failed to pledge: ' + e.message);
    }
  }

  async function handleCreateRecurring() {
    if (!nostrUser || !tier || !recurringAmount) {
      setError('Fill in amount and load a tier.');
      return;
    }
    try {
      setError(null);
      const next = Math.floor(Date.now() / 1000) + (period === 'daily' ? 86400 : 604800);
      const event = {
        kind: KIND_RECURRING_PLEDGE,
        tags: [
          ['p', creatorKey],
          ['e', tier.id || ''],
          ['amount', recurringAmount],
          ['currency', 'BTC'],
          ['period', period],
          ['next_payment_due', String(next)],
          ['status', 'active'],
          ['d', Math.random().toString(36).slice(2)]
        ],
        content: note
      };
      await publishNostrEvent(event);
      addToast('Recurring pledge published!', 'success');
    } catch (e) {
      setError('Failed to create recurring pledge: ' + e.message);
    }
  }

  return (
    <div>
      <RelayManager />
      <h2>Support a Creator</h2>
      <div style={{ marginBottom: 12 }}>
        <input
          placeholder="NWC URI"
          value={nwcUri}
          onChange={e => setNwcUri(e.target.value)}
          style={{ width: '60%' }}
        />
        <button
          onClick={() => {
            if (!connectNwc(nwcUri)) addToast('Invalid URI', 'danger');
          }}
          style={{ marginLeft: 8 }}
        >
          Connect Wallet
        </button>
        {nwc && <span style={{ marginLeft: 8, color: 'green' }}>Connected</span>}
      </div>
      <input placeholder="Creator Pubkey" value={creatorKey} onChange={e => setCreatorKey(e.target.value)} />
      <button onClick={handleFetchCreatorTier}>Find Tier</button>
      {creatorProfile && (
        <ProfileCard pubkey={creatorKey} />
      )}
      {tier && (
        <div>
          <h3>Tier</h3>
          <pre>{JSON.stringify(tier, null, 2)}</pre>
          {tier.paymentInstructions && <QRCodeSVG value={tier.paymentInstructions} />}
          <button onClick={handlePledgeSupport}>Pledge Support (Mock)</button>
          <div style={{ marginTop: 16 }}>
            <input
              placeholder="Amount (sats)"
              type="number"
              value={recurringAmount}
              onChange={e => setRecurringAmount(e.target.value)}
              style={{ marginRight: 8 }}
            />
            <select value={period} onChange={e => setPeriod(e.target.value)} style={{ marginRight: 8 }}>
              <option value="weekly">Weekly</option>
              <option value="daily">Daily</option>
            </select>
            <input
              placeholder="Optional note"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
            <button style={{ marginLeft: 8 }} onClick={handleCreateRecurring}>
              Start Recurring Support
            </button>
          </div>
        </div>
      )}
      {duePledges.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h3>Payments Due</h3>
          <ul>
            {duePledges.map(ev => (
              <li key={ev.id}>
                To {ev.tags.find(t => t[0] === 'p')?.[1]}
                <button style={{ marginLeft: 8 }} onClick={() => handlePayPledge(ev)}>
                  Pay Now
                </button>
                {cashuTokens.length > 0 && (
                  <button style={{ marginLeft: 8 }} onClick={() => handlePayPledgeCashu(ev)}>
                    Pay with Cashu
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <InvoiceModal invoice={invoiceModal} onClose={() => setInvoiceModal(null)} />
    </div>
  );
}
