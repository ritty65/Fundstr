import type { Tier } from 'src/nutzap/types';

export type TierDraft = {
  id: string;
  title: string;
  price: string;
  frequency: Tier['frequency'];
  description: string;
  media: string[];
};

export type TierFieldErrors = {
  title?: string;
  price?: string;
  frequency?: string;
  media?: (string | null)[];
};

export const tierFrequencies: Tier['frequency'][] = ['one_time', 'monthly', 'yearly'];

export function createEmptyDraft(overrides: Partial<TierDraft> = {}): TierDraft {
  return {
    id: overrides.id ?? '',
    title: overrides.title ?? '',
    price: overrides.price ?? '',
    frequency: overrides.frequency ?? 'monthly',
    description: overrides.description ?? '',
    media: overrides.media ? [...overrides.media] : [],
  };
}

export function tierToDraft(tier: Tier): TierDraft {
  return {
    id: tier.id,
    title: tier.title ?? '',
    price: Number.isFinite(tier.price) ? String(tier.price) : '',
    frequency: tier.frequency ?? 'monthly',
    description: tier.description ?? '',
    media: Array.isArray(tier.media) ? tier.media.map(entry => entry?.url ?? '').filter(url => typeof url === 'string') : [],
  };
}

export function draftToTier(draft: TierDraft): Tier {
  const trimmedTitle = draft.title.trim();
  const priceNumber = draft.price === '' ? Number.NaN : Number(draft.price);
  const normalizedPrice = Number.isFinite(priceNumber) ? Math.round(priceNumber) : Number.NaN;
  const description = draft.description.trim();
  const media = draft.media
    .map(url => url.trim())
    .filter(Boolean)
    .map(url => ({ type: 'link', url }));

  return {
    id: draft.id || `${Date.now()}-${Math.random()}`,
    title: trimmedTitle,
    price: normalizedPrice,
    frequency: tierFrequencies.includes(draft.frequency) ? draft.frequency : 'monthly',
    ...(description ? { description } : {}),
    ...(media.length ? { media } : {}),
  };
}

export function validateTierDraft(draft: TierDraft): TierFieldErrors {
  const errors: TierFieldErrors = {};
  if (!draft.title.trim()) {
    errors.title = 'Title is required.';
  }
  const priceNumber = Number(draft.price);
  if (draft.price === '') {
    errors.price = 'Price is required.';
  } else if (!Number.isFinite(priceNumber) || priceNumber <= 0) {
    errors.price = 'Enter a positive number of sats.';
  } else if (!Number.isInteger(priceNumber)) {
    errors.price = 'Price must be a whole number of sats.';
  }
  if (!tierFrequencies.includes(draft.frequency)) {
    errors.frequency = 'Select a billing frequency.';
  }
  if (draft.media.length) {
    const mediaErrors = draft.media.map(url => {
      const trimmed = url.trim();
      if (!trimmed) {
        return 'Enter a URL or remove the empty media row.';
      }
      if (!/^https?:\/\//i.test(trimmed)) {
        return 'Media URLs must start with http:// or https://';
      }
      return null;
    });
    if (mediaErrors.some(Boolean)) {
      errors.media = mediaErrors;
    }
  }
  return errors;
}

export function hasTierErrors(errors: TierFieldErrors | null | undefined): boolean {
  if (!errors) {
    return false;
  }
  if (errors.title || errors.price || errors.frequency) {
    return true;
  }
  if (Array.isArray(errors.media) && errors.media.some(Boolean)) {
    return true;
  }
  return false;
}
