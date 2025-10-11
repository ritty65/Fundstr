import { describe, expect, it } from 'vitest';

import { normalizeMintUrl } from 'src/pages/CreatorStudioPage.vue';

describe('normalizeMintUrl', () => {
  it('lowercases and trims whitespace', () => {
    expect(normalizeMintUrl('  HTTPS://Mint.EXAMPLE.COM  ')).toBe('https://mint.example.com');
  });

  it('removes redundant trailing slashes', () => {
    expect(normalizeMintUrl('https://mint.example.com/')).toBe('https://mint.example.com');
    expect(normalizeMintUrl('https://mint.example.com////')).toBe('https://mint.example.com');
  });

  it('returns empty string for non-string input or empty result', () => {
    expect(normalizeMintUrl(undefined)).toBe('');
    expect(normalizeMintUrl('   ')).toBe('');
  });

  it('preserves intermediate path segments while trimming ending slash', () => {
    expect(normalizeMintUrl('https://mint.example.com/path/')).toBe('https://mint.example.com/path');
  });
});
