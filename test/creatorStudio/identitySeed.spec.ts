import { describe, expect, it } from 'vitest';
import { ref } from 'vue';

import { seedProfileIdentityFromMetadata } from 'src/pages/creator-studio/identitySeed';

describe('seedProfileIdentityFromMetadata', () => {
  it('seeds display name and picture when refs are empty', () => {
    const displayName = ref('');
    const pictureUrl = ref('');

    const result = seedProfileIdentityFromMetadata(
      { display_name: 'Creator', picture: 'https://example.com/avatar.png' },
      { displayName, pictureUrl }
    );

    expect(result).toEqual({ seededDisplayName: true, seededPicture: true, seededAny: true });
    expect(displayName.value).toBe('Creator');
    expect(pictureUrl.value).toBe('https://example.com/avatar.png');
  });

  it('falls back to metadata.name when display_name is missing', () => {
    const displayName = ref('');
    const pictureUrl = ref('');

    const result = seedProfileIdentityFromMetadata(
      { name: 'Fallback Name' },
      { displayName, pictureUrl }
    );

    expect(result.seededDisplayName).toBe(true);
    expect(result.seededPicture).toBe(false);
    expect(result.seededAny).toBe(true);
    expect(displayName.value).toBe('Fallback Name');
    expect(pictureUrl.value).toBe('');
  });

  it('does not override existing values', () => {
    const displayName = ref('Existing Name');
    const pictureUrl = ref('https://example.com/current.png');

    const result = seedProfileIdentityFromMetadata(
      { display_name: 'New Name', picture: 'https://example.com/new.png' },
      { displayName, pictureUrl }
    );

    expect(result).toEqual({ seededDisplayName: false, seededPicture: false, seededAny: false });
    expect(displayName.value).toBe('Existing Name');
    expect(pictureUrl.value).toBe('https://example.com/current.png');
  });
});
