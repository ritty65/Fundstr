export interface SupporterProfile {
  name: string;
  npub: string;
  blurb: string;
  avatarUrl?: string;
}

/**
 * Highlighted Fundstr supporters and donors.
 *
 * To update:
 * 1. Add a new entry to the SUPPORTERS array with the supporter name, npub (or key), and a short blurb.
 * 2. Optionally include an avatarUrl pointing to an optimized, privacy-friendly image (SVG/PNG/WebP).
 * 3. Keep the list sorted by the order you want supporters displayed on the Supporters page.
 */
export const SUPPORTERS: SupporterProfile[] = [
  {
    name: "KalonAxiarch",
    npub: "npub1aljmhjp5tqrw3m60ra7t3u8uqq223d6rdg9q0h76a8djd9m4hmvsmlj82m",
    blurb: "Creator of Fundstr leading privacy-first patronage tools across the Nostr ecosystem.",
  },
  {
    name: "Kalon Axiarch",
    npub: "npub18pqmz8t3sfp7r7eewdzpth4n9h4u45q4dxsv3sv9k67xw8rs3f5sl9vh9s",
    blurb: "Fundstr's founding supporter championing open, censorship-resistant tools for creators.",
    avatarUrl: "https://cdn.fundstr.me/supporters/kalon.png",
  },
  {
    name: "Bitcoin Jungle",
    npub: "npub1jungl3h5rxxz3sq9le2uhk6v5h8z8z6kthhs6j4z5z4x8ge4lt2vk5z7pt",
    blurb: "Backing Cashu experiments that bring circular economies to life across Costa Rica.",
    avatarUrl: "https://cdn.fundstr.me/supporters/bitcoin-jungle.png",
  },
  {
    name: "Arctic Node",
    npub: "npub1arcticj94k6ze3ndp7f8jccq03n7l82w7lnk0v7pn57v8c9ay48s8d0u0p4",
    blurb: "Running infrastructure that keeps Fundstr relays humming for our global community.",
  },
  {
    name: "Nostr Design Collective",
    npub: "npub1design6l4f7ce6em0jh4c3cfy32q8e4j7j5ll0mlql5wvs6k97nxqljg6m8",
    blurb: "Designing delightful experiences for zaps, chats, and supporter memberships on Nostr.",
  },
];
