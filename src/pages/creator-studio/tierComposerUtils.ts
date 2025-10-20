import type { Tier } from 'src/nutzap/types';
import { inferTierMediaType } from 'src/nutzap/profileShared';
import { determineMediaType, normalizeMediaUrl } from 'src/utils/validateMedia';

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
    price: overrides.price ?? '1000',
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

type ExistingTierMedia = NonNullable<Tier['media']>[number];

function normalizeExistingMedia(existingTier?: Tier): ExistingTierMedia[] {
  if (!existingTier || !Array.isArray(existingTier.media)) {
    return [];
  }

  return existingTier.media
    .map(entry => {
      if (!entry) return null;
      const url = typeof entry.url === 'string' ? entry.url.trim() : '';
      if (!url) return null;
      const title = typeof entry.title === 'string' ? entry.title : undefined;
      const rawType = typeof entry.type === 'string' ? entry.type.trim().toLowerCase() : '';
      const allowedTypes: Array<NonNullable<ExistingTierMedia['type']>> = ['image', 'video', 'audio', 'link'];
      const type = allowedTypes.includes(rawType as NonNullable<ExistingTierMedia['type']>)
        ? (rawType as NonNullable<ExistingTierMedia['type']>)
        : undefined;
      return {
        url,
        ...(title ? { title } : {}),
        ...(type ? { type } : {}),
      } satisfies ExistingTierMedia;
    })
    .filter((entry): entry is ExistingTierMedia => Boolean(entry));
}

function buildExistingMediaLookup(existingTier?: Tier): Map<string, ExistingTierMedia[]> {
  const lookup = new Map<string, ExistingTierMedia[]>();
  for (const media of normalizeExistingMedia(existingTier)) {
    const list = lookup.get(media.url) ?? [];
    list.push(media);
    lookup.set(media.url, list);
  }
  return lookup;
}

function resolveExistingMedia(
  lookup: Map<string, ExistingTierMedia[]>,
  url: string,
): ExistingTierMedia | null {
  const matches = lookup.get(url);
  if (!matches || matches.length === 0) {
    return null;
  }
  const match = matches.shift() ?? null;
  if (!matches.length) {
    lookup.delete(url);
  }
  return match;
}

function inferDraftMediaType(url: string, existing?: ExistingTierMedia): ExistingTierMedia['type'] {
  const allowedTypes: Array<NonNullable<ExistingTierMedia['type']>> = ['image', 'video', 'audio', 'link'];
  const existingType = existing?.type;
  if (existingType && allowedTypes.includes(existingType)) {
    return existingType;
  }

  const inferred = inferTierMediaType(url, existingType);
  if (inferred && inferred !== 'link' && allowedTypes.includes(inferred)) {
    return inferred;
  }

  const normalizedUrl = normalizeMediaUrl(url);
  const detected = determineMediaType(normalizedUrl);

  if (detected === 'image') {
    return 'image';
  }
  if (detected === 'video' || detected === 'youtube') {
    return 'video';
  }
  if (detected === 'audio') {
    return 'audio';
  }
  if (detected === 'iframe') {
    return 'link';
  }

  return undefined;
}

export function draftToTier(draft: TierDraft, existingTier?: Tier): Tier {
  const trimmedTitle = draft.title.trim();
  const priceNumber = draft.price === '' ? Number.NaN : Number(draft.price);
  const normalizedPrice = Number.isFinite(priceNumber) ? Math.round(priceNumber) : Number.NaN;
  const description = draft.description.trim();
  const existingLookup = buildExistingMediaLookup(existingTier);
  const media = draft.media
    .map(rawUrl => rawUrl.trim())
    .filter(Boolean)
    .map(url => {
      const existing = resolveExistingMedia(existingLookup, url);
      const type = inferDraftMediaType(url, existing);
      const title = existing?.title?.trim();

      return {
        url,
        ...(title ? { title } : {}),
        ...(type ? { type } : {}),
      } satisfies ExistingTierMedia;
    });

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
        return null;
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
