import type NDK from "@nostr-dev-kit/ndk";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { probeWriteRelays, selectHealthyWriteRelays, type RelayProbeResult } from "src/nostr/relayHealth";
import { publishWithAcks, type RelayAck } from "src/nostr/publishWithAcks";
import { verifyReadBack } from "src/nostr/readBack";
import type { NormalizedSigner } from "src/nostr/signer";

export async function publishOrchestrator(opts: {
  ndk: NDK;
  event10019: NDKEvent;
  event30019: NDKEvent;
  userRelays: string[];
  vettedOpenRelays: string[];
  fallbackAllowed: boolean;
  signer: NormalizedSigner;
}): Promise<{
  probe: RelayProbeResult[];
  acks10019: RelayAck[];
  acks30019: RelayAck[];
  readback10019: boolean;
  readback30019: boolean;
}> {
  const candidate = Array.from(new Set(opts.userRelays));
  const probe = await probeWriteRelays({ ndk: opts.ndk, relayUrls: candidate, timeoutMs: 2500 });
  let healthy = selectHealthyWriteRelays(probe);

  if (healthy.length === 0) {
    if (!opts.fallbackAllowed) {
      throw new Error("No write relays reachable");
    }
    const fallbackProbe = await probeWriteRelays({ ndk: opts.ndk, relayUrls: opts.vettedOpenRelays, timeoutMs: 2500 });
    healthy = selectHealthyWriteRelays(fallbackProbe);
    if (healthy.length === 0) {
      throw new Error("No write relays reachable (even after fallback)");
    }
  }

  await opts.event10019.sign(opts.signer.ndkSigner);
  const a1 = await publishWithAcks({ ndk: opts.ndk, event: opts.event10019, relayUrls: healthy });
  if (!a1.firstOkUrl) {
    throw new Error("Publish of 10019 received no OK from any relay");
  }
  const rb1 = await verifyReadBack({
    ndk: opts.ndk,
    relayUrl: a1.firstOkUrl,
    authorHex: opts.signer.pubkeyHex,
    kind: 10019,
    timeoutMs: 2000,
  });

  await opts.event30019.sign(opts.signer.ndkSigner);
  const a2 = await publishWithAcks({ ndk: opts.ndk, event: opts.event30019, relayUrls: healthy });
  if (!a2.firstOkUrl) {
    throw new Error("Publish of 30019 received no OK from any relay");
  }
  const rb2 = await verifyReadBack({
    ndk: opts.ndk,
    relayUrl: a2.firstOkUrl,
    authorHex: opts.signer.pubkeyHex,
    kind: 30019,
    dTag: "tiers",
    timeoutMs: 2000,
  });

  return {
    probe,
    acks10019: a1.acks,
    acks30019: a2.acks,
    readback10019: rb1,
    readback30019: rb2,
  };
}
