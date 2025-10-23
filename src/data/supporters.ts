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
    name: "Anonymous Supporter",
    npub: "npub1mxmqzhgvla9wrgc8qlptmuylqzal2c50pc744zcm9kunhekv6g3s63ytu0",
    blurb: "Backing Fundstr's privacy-first mission while helping shape creator tools across the Nostr ecosystem.",
  },
];
