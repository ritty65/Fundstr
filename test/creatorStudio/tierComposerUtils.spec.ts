import { describe, expect, it } from 'vitest';
import { draftToTier, type TierDraft } from 'src/pages/creator-studio/tierComposerUtils';
import type { Tier } from 'src/nutzap/types';

describe('draftToTier media inference', () => {
  const baseDraft: TierDraft = {
    id: 'tier-1',
    title: 'Example',
    price: '1000',
    frequency: 'monthly',
    description: '',
    media: [],
  };

  it('detects image URLs by extension', () => {
    const draft: TierDraft = {
      ...baseDraft,
      media: ['https://cdn.example.com/photo.jpeg'],
    };

    const tier = draftToTier(draft);

    expect(tier.media).toEqual([
      {
        url: 'https://cdn.example.com/photo.jpeg',
        type: 'image',
      },
    ]);
  });

  it('detects video URLs by extension', () => {
    const draft: TierDraft = {
      ...baseDraft,
      media: ['https://videos.example.com/clip.mp4'],
    };

    const tier = draftToTier(draft);

    expect(tier.media).toEqual([
      {
        url: 'https://videos.example.com/clip.mp4',
        type: 'video',
      },
    ]);
  });

  it('detects audio URLs by extension', () => {
    const draft: TierDraft = {
      ...baseDraft,
      media: ['https://audio.example.com/song.mp3'],
    };

    const tier = draftToTier(draft);

    expect(tier.media).toEqual([
      {
        url: 'https://audio.example.com/song.mp3',
        type: 'audio',
      },
    ]);
  });

  it('marks plain links so they render as chips', () => {
    const draft: TierDraft = {
      ...baseDraft,
      media: ['https://example.com'],
    };

    const tier = draftToTier(draft);

    expect(tier.media).toEqual([
      {
        url: 'https://example.com',
        type: 'link',
      },
    ]);
  });

  it('treats embeddable video providers as video media', () => {
    const draft: TierDraft = {
      ...baseDraft,
      media: ['https://youtu.be/dQw4w9WgXcQ'],
    };

    const tier = draftToTier(draft);

    expect(tier.media).toEqual([
      {
        url: 'https://youtu.be/dQw4w9WgXcQ',
        type: 'video',
      },
    ]);
  });

  it('preserves existing titles and types when URLs are unchanged', () => {
    const existing: Tier = {
      id: 'tier-1',
      title: 'Example',
      price: 1000,
      frequency: 'monthly',
      media: [
        {
          url: 'https://example.com',
          type: 'link',
          title: 'Homepage',
        },
      ],
    };

    const draft: TierDraft = {
      ...baseDraft,
      media: ['https://example.com'],
    };

    const tier = draftToTier(draft, existing);

    expect(tier.media).toEqual([
      {
        url: 'https://example.com',
        type: 'link',
        title: 'Homepage',
      },
    ]);
  });
});
