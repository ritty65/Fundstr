import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive, ref } from 'vue';

import {
  __resetSerializableEventWarningForTests,
  prepareUnsignedEvent,
  type UnsignedEvent,
} from '../../../src/nostr/serializableEvent';

describe('prepareUnsignedEvent', () => {
  beforeEach(() => {
    __resetSerializableEventWarningForTests();
  });

  it('sanitizes reactive tags and coerces values to trimmed strings', () => {
    const tags = reactive([
      reactive(['d', ' Tier 1 ']),
      ref(['t', 123, null]) as any,
    ]) as any;

    const result = prepareUnsignedEvent({
      kind: '30019.9',
      tags,
      content: 42,
      created_at: '1700000000.4',
    });

    expect(result.kind).toBe(30019);
    expect(result.content).toBe('42');
    expect(result.tags).toEqual([
      ['d', 'Tier 1'],
      ['t', '123', ''],
    ]);
    expect(result.tags).not.toBe(tags);
    expect(() => structuredClone(result)).not.toThrow();
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('fills defaults and produces cloneable plain objects', () => {
    const before = Math.floor(Date.now() / 1000);
    const result = prepareUnsignedEvent({ kind: 1, tags: [], content: null });
    const after = Math.floor(Date.now() / 1000);

    expect(result.created_at).toBeGreaterThanOrEqual(before);
    expect(result.created_at).toBeLessThanOrEqual(after);
    expect(result.tags).toEqual([]);
    expect(result.content).toBe('');
    expect(() => structuredClone(result)).not.toThrow();
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('falls back to JSON cloning once when structuredClone fails', () => {
    const originalStructuredClone = globalThis.structuredClone;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const structuredCloneMock = vi.fn(() => {
      throw new Error('Proxy object could not be cloned');
    });

    (globalThis as any).structuredClone = structuredCloneMock;

    let firstResult: UnsignedEvent | null = null;
    let secondResult: UnsignedEvent | null = null;

    try {
      firstResult = prepareUnsignedEvent({
        kind: 10019,
        content: ' profile ',
        tags: [[ref('a'), reactive(['relay', 123])]],
        created_at: 123.9,
      });
      expect(structuredCloneMock).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(() => JSON.stringify(firstResult)).not.toThrow();

      secondResult = prepareUnsignedEvent({ kind: 1, tags: [], content: '' });
      expect(structuredCloneMock).toHaveBeenCalledTimes(2);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
      (globalThis as any).structuredClone = originalStructuredClone;
    }

    if (typeof originalStructuredClone === 'function' && firstResult) {
      expect(() => originalStructuredClone(firstResult)).not.toThrow();
    }
    if (typeof originalStructuredClone === 'function' && secondResult) {
      expect(() => originalStructuredClone(secondResult)).not.toThrow();
    }
  });
});
