/**
 * Sanitizes unsigned Nostr events so they can cross structured-clone boundaries
 * (postMessage, extension messaging, NIP-07 bridges, etc.).
 *
 * References:
 * - https://developer.mozilla.org/docs/Web/API/Web_Workers_API/Structured_clone_algorithm
 * - https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/Chrome_incompatibilities#data_cloning_algorithm
 */
export type SerializableTag = [string, ...string[]];

export interface UnsignedEvent {
  kind: number;
  tags: SerializableTag[];
  content: string;
  created_at: number;
}

type MaybeRef<T> = T | { value: T };

type MaybeReadonlyArray<T> = MaybeRef<MaybeRef<T[]> & { __v_isRef?: true }>;

let structuredCloneWarningIssued = false;

function unwrapRef<T>(value: MaybeRef<T>): T {
  let current: any = value;
  const seen = new Set<any>();
  while (
    current &&
    typeof current === 'object' &&
    '__v_isRef' in current &&
    (current as any).__v_isRef &&
    'value' in current
  ) {
    if (seen.has(current)) {
      break;
    }
    seen.add(current);
    current = current.value;
  }
  return (current ?? value) as T;
}

function normalizeArray(input: unknown): unknown[] | undefined {
  const unwrapped = unwrapRef(input as MaybeReadonlyArray<unknown>);
  if (Array.isArray(unwrapped)) {
    return unwrapped;
  }
  return undefined;
}

function asString(value: unknown): string {
  const unwrapped = unwrapRef(value as MaybeRef<unknown>);
  const normalized = typeof unwrapped === 'string' ? unwrapped : String(unwrapped ?? '');
  return normalized.trim();
}

function sanitizeTags(input: unknown): SerializableTag[] {
  const maybeTags = normalizeArray(input);
  if (!maybeTags) {
    return [];
  }

  const sanitized: SerializableTag[] = [];
  for (const rawTag of maybeTags) {
    const partsSource = normalizeArray(rawTag) ?? [];
    if (!partsSource.length) {
      continue;
    }
    const parts = partsSource.map(asString);
    if (!parts.length) {
      continue;
    }
    sanitized.push(parts as SerializableTag);
  }
  return sanitized;
}

function coerceKind(value: unknown): number {
  const numeric = Number(unwrapRef(value as MaybeRef<unknown>));
  return Number.isFinite(numeric) ? Math.floor(numeric) : 0;
}

function coerceCreatedAt(value: unknown): number {
  const numeric = Number(unwrapRef(value as MaybeRef<unknown>));
  if (Number.isFinite(numeric)) {
    return Math.floor(numeric);
  }
  return Math.floor(Date.now() / 1000);
}

function cloneViaJson(event: UnsignedEvent): UnsignedEvent {
  return JSON.parse(JSON.stringify(event)) as UnsignedEvent;
}

function ensureCloneable(event: UnsignedEvent): UnsignedEvent {
  const structuredCloneFn = (globalThis as any).structuredClone as
    | (<T>(value: T) => T)
    | undefined;

  if (typeof structuredCloneFn === 'function') {
    try {
      structuredCloneFn(event);
      return event;
    } catch (err) {
      if (!structuredCloneWarningIssued) {
        structuredCloneWarningIssued = true;
        console.warn(
          `[nostr] structuredClone preflight failed (kind=${event.kind}, tags=${event.tags.length}); falling back to JSON clone`,
          err,
        );
      }
      return cloneViaJson(event);
    }
  }

  return cloneViaJson(event);
}

export function prepareUnsignedEvent(input: unknown): UnsignedEvent {
  const kind = coerceKind((input as any)?.kind);
  const created_at = coerceCreatedAt((input as any)?.created_at);
  const content = asString((input as any)?.content);
  const tags = sanitizeTags((input as any)?.tags);

  const event: UnsignedEvent = {
    kind,
    created_at,
    content,
    tags,
  };

  return ensureCloneable(event);
}

export function __resetSerializableEventWarningForTests() {
  structuredCloneWarningIssued = false;
}
