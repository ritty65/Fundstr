# Storage backup and migration fixtures

## Backup payload shape

Backups exported by `useStorageStore.exportWalletState` contain:

- All `localStorage` keys and values as string entries.
- Dexie tables serialized as JSON strings under the following keys:
  - `cashu.dexie.db.proofs`
  - `cashu.dexie.db.lockedTokens`
  - `cashu.dexie.db.subscriptions`
  - `cashu.dexie.db.historyTokens`

Each Dexie table entry retains the fields defined in `src/stores/dexie.ts` for the
application version that produced the backup. When restoring, the payload is fed
back into Dexie and replayed through migrations to reach the current schema.

## IndexedDB regression snapshots

Realistic historical snapshots live in
`test/vitest/fixtures/indexeddb-snapshots/` and mirror exports taken from earlier
app versions. Each fixture has the shape:

```json
{
  "version": <number>,
  "localStorage": { "<key>": "<value>" },
  "tables": { "<tableName>": [/* records */] },
  "messenger": {
    "conversations": { "<pubkey>": [/* messages */] },
    "unreadCounts": { "<pubkey>": <number> }
  }
}
```

- `version` matches the Dexie schema version the data was captured from.
- `localStorage` mirrors persisted settings such as `cashu.mints` so migrations
  can rewrite legacy values (e.g., stablenut URLs).
- `tables` contains the exported IndexedDB rows keyed by table name so
  Dexie can recreate the older database before upgrading.
- `messenger` embeds representative message and unread state to exercise
  cleanup migrations.

Add new fixtures alongside the existing `v6-stablenut.json` and
`v20-subscriptions.json` files whenever schemas change to guard against
regressions.
