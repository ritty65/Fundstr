export type NostrEvent = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
};

export function toPlainNostrEvent(ev: any): NostrEvent {
  // Prefer toNostrEvent() (NDK >= 0.8), fallback rawEvent() (older NDK), else assume plain.
  const e = typeof ev?.toNostrEvent === 'function'
    ? ev.toNostrEvent()
    : (typeof ev?.rawEvent === 'function' ? ev.rawEvent() : ev);

  const ok = e &&
    typeof e.id === 'string' &&
    typeof e.pubkey === 'string' &&
    typeof e.created_at === 'number' &&
    typeof e.kind === 'number' &&
    Array.isArray(e.tags) &&
    typeof e.content === 'string' &&
    typeof e.sig === 'string';

  if (!ok) {
    throw new Error('client: bad event (missing id/pubkey/created_at/kind/tags/content/sig)');
  }
  return e as NostrEvent;
}
