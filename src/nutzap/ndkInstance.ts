import type NDK from '@nostr-dev-kit/ndk';
import { connectNdk, ndkWrite } from 'src/nostr/ndk';

let connectStarted = false;

export function getNutzapNdk(): NDK {
  if (!connectStarted) {
    connectStarted = true;
    void connectNdk().catch(err => {
      console.warn('[nutzap] failed to connect shared NDK instances', err);
    });
  }
  return ndkWrite;
}
