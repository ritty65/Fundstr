export type NostrEvent = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
};

export async function toPlainNostrEvent(ev: any): Promise<NostrEvent> {
  // NDK >= 0.8: toNostrEvent() async; older NDK: rawEvent(); else assume ev is plain.
  const candidate =
    typeof ev?.toNostrEvent === 'function' ? ev.toNostrEvent()
    : typeof ev?.rawEvent === 'function' ? ev.rawEvent()
    : ev;

  const e = await Promise.resolve(candidate);

  const ok =
    e && typeof e.id === 'string' &&
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
