// Centralized list of creators that should expose donation actions even when
// their profiles lack obvious Lightning metadata. Entries may be npubs or hex
// pubkeys; consumers should normalize before comparison.
export const DONATION_FALLBACK_CREATORS: string[] = [
  'npub1aljmhjp5tqrw3m60ra7t3u8uqq223d6rdg9q0h76a8djd9m4hmvsmlj82m',
];

export const DONATION_FALLBACK_LOOKUP = new Set(
  DONATION_FALLBACK_CREATORS.map((entry) =>
    typeof entry === 'string' ? entry.trim().toLowerCase() : '',
  ).filter(Boolean),
);
