export type TierMediaType = 'image' | 'video' | 'audio' | 'link';

export type TierMedia = {
  url: string;
  title?: string;
  type?: TierMediaType;
};

export type Tier = {
  id: string;
  title: string;
  price: number; // sats
  frequency: 'one_time' | 'monthly' | 'yearly'; // adjust if needed
  description?: string;
  media?: TierMedia[];
};

export type NutzapProfileContent = {
  v: number;
  p2pk: string; // hex P2PK pubkey
  mints: string[]; // URLs
  relays: string[]; // e.g. ["wss://relay.fundstr.me"]
  tierAddr?: string; // e.g. "30000:<pubkey>:tiers" or naddr form
};
