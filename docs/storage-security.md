# Storage security notes

## IndexedDB / Dexie caches
- `CashuDexie` persists proofs, locked subscription tokens, creator caches, and other wallet metadata directly to IndexedDB without any encryption layer; data remains readable to anyone with access to the browser profile. Schema definitions live in `src/stores/dexie.ts`.
- The messenger database (`src/stores/messengerDb.ts`) stores DM ciphertext, relay health, and queued messages as plain JSON in IndexedDB. No application-level encryption is applied on top of the browser sandbox.
- Attachment processing state in `src/stores/attachmentsDb.ts` records upload blobs plus optional AES keys/IVs in clear text. These fields are meant for transient processing and rely on device-level storage protections.

## Key material
- Wallet and Nostr secrets are kept out of Dexie. Instead, the Nostr store derives an AES-GCM key from the user PIN (`deriveKey`) and uses it to encrypt values before writing them into `localStorage`; decryption requires loading that key back into memory and calling `secureGetItem`/`secureSetItem` (`src/stores/nostr.ts`).
- The key-derivation and encrypt/decrypt helpers live in `src/utils/crypto-service.ts` and include a random salt persisted under `cashu.salt`, PBKDF2-SHA256 with versioned metadata (current default: 310k iterations), and 256-bit AES-GCM. Legacy salts are normalized to the new metadata format for backward compatibility.
- Because the encryption key only exists in memory after unlock, the encrypted `localStorage` blobs for `cashu.ndk.*` keys remain unreadable to the app until the user provides the PIN.

## Logging and builds
- ESLint now blocks `console.log`/`console.info`/`console.debug` across the app (except the central logger helper) to reduce accidental leakage of secrets in development builds.
- Production builds already strip all `console` calls via the `esbuild.drop` setting in `quasar.config.js`, removing verbose diagnostics from shipped bundles.
