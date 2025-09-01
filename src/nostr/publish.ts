export type AckOutcome = 'ok' | 'failed' | 'timeout' | 'blocked';

export async function publishWithAck(relay: any, event: any, timeoutMs = 2000): Promise<AckOutcome> {
  try {
    const res = relay.publish(event);
    if (res && typeof res.on === 'function') {
      return await new Promise<AckOutcome>((resolve) => {
        let done = false;
        const to = setTimeout(() => {
          if (!done) {
            done = true;
            resolve('timeout');
          }
        }, timeoutMs);
        res.on('ok', () => {
          if (!done) {
            done = true;
            clearTimeout(to);
            resolve('ok');
          }
        });
        res.on('failed', (reason: string) => {
          if (!done) {
            done = true;
            clearTimeout(to);
            if (/restricted|blocked|kind/i.test(reason)) resolve('blocked');
            else resolve('failed');
          }
        });
      });
    }
    await Promise.race([
      Promise.resolve(res),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
    ]);
    return 'ok';
  } catch (e: any) {
    if (String(e?.message || e).match(/restricted|blocked|kind/i)) return 'blocked';
    if (String(e?.message || e).includes('timeout')) return 'timeout';
    return 'failed';
  }
}

export async function publishDMSequential(relays: any[], event: any, timeoutMs = 2000) {
  const results: Record<string, AckOutcome> = {};
  for (const r of relays) {
    const outcome = await publishWithAck(r, event, timeoutMs);
    results[r.url ?? r] = outcome;
    if (outcome === 'ok') return { ok: true, firstAck: r.url ?? r, results };
  }
  return { ok: false, firstAck: null, results };
}
