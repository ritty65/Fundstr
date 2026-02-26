import { date } from "quasar";
import { defineStore } from "pinia";
import { PaymentRequest, Token } from "@cashu/cashu-ts";
import token from "src/js/token";
import { DEFAULT_COLOR } from "src/js/constants";
import { DEFAULT_BUCKET_ID } from "@/constants/buckets";
import { useProofsStore } from "./proofs";
import { cashuDb } from "./dexie";
import { liveQuery } from "dexie";
import { v4 as uuidv4 } from "uuid";
import type { HistoryToken } from "@/types/historyToken";

/**
 * The tokens store handles everything related to tokens and proofs
 */

export type { HistoryToken } from "@/types/historyToken";

export const useTokensStore = defineStore("tokens", {
  state: () => {
    const state: TokensStoreState = {
      historyTokens: [],
    };

    initializeHistoryTokensState(state);

    return state;
  },
  actions: {
    /**
     * @param {{amount: number, token: string, mint: string, unit: string}} param0
     */
    addPaidToken({
      amount,
      token,
      mint,
      unit,
      fee,
      paymentRequest,
      label,
      description,
      color,
      bucketId = DEFAULT_BUCKET_ID,
      referenceId,
    }: {
      amount: number;
      token: string;
      mint: string;
      unit: string;
      fee?: number;
      paymentRequest?: PaymentRequest;
      label?: string;
      description?: string;
      color?: string;
      bucketId?: string;
      referenceId?: string;
    }) {
      const entry: HistoryToken = {
        id: uuidv4(),
        status: "paid",
        amount,
        date: currentDateStr(),
        token,
        mint,
        unit,
        label,
        description,
        color: color ?? DEFAULT_COLOR,
        fee,
        paymentRequest,
        bucketId,
        referenceId,
        archived: false,
        archivedAt: null,
        createdAt: Date.now(),
      };

      this.historyTokens.push(entry);
      persistLatestToken(entry);
    },
    addPendingToken({
      amount,
      tokenStr,
      mint,
      unit,
      fee,
      paymentRequest,
      label,
      description,
      color,
      bucketId = DEFAULT_BUCKET_ID,
      referenceId,
    }: {
      amount: number;
      tokenStr: string;
      mint: string;
      unit: string;
      fee?: number;
      paymentRequest?: PaymentRequest;
      label?: string;
      description?: string;
      color?: string;
      bucketId?: string;
      referenceId?: string;
    }) {
      const entry: HistoryToken = {
        id: uuidv4(),
        status: "pending",
        amount,
        date: currentDateStr(),
        token: tokenStr,
        mint,
        unit,
        label,
        description,
        color: color ?? DEFAULT_COLOR,
        fee,
        paymentRequest,
        bucketId,
        referenceId,
        archived: false,
        archivedAt: null,
        createdAt: Date.now(),
      };

      this.historyTokens.push(entry);
      persistLatestToken(entry);
    },
    editHistoryToken(
      tokenToEdit: string,
      options?: {
        newAmount?: number;
        addAmount?: number;
        newStatus?: "paid" | "pending";
        newToken?: string;
        newFee?: number;
        newLabel?: string;
        newColor?: string;
        newDescription?: string;
      },
    ): HistoryToken | undefined {
      const index = this.historyTokens.findIndex(
        (t) => t.token === tokenToEdit,
      );
      if (index >= 0) {
        if (options) {
          if (options.newToken) {
            this.historyTokens[index].token = options.newToken;
          }
          if (options.newAmount) {
            this.historyTokens[index].amount =
              options.newAmount * Math.sign(this.historyTokens[index].amount);
          }
          if (options.addAmount) {
            if (this.historyTokens[index].amount > 0) {
              this.historyTokens[index].amount += options.addAmount;
            } else {
              this.historyTokens[index].amount -= options.addAmount;
            }
          }
          if (options.newStatus) {
            this.historyTokens[index].status = options.newStatus;
          }
          if (options.newFee) {
            this.historyTokens[index].fee = options.newFee;
          }
          if (options.newLabel !== undefined) {
            this.historyTokens[index].label = options.newLabel;
            try {
              const tokenJson = token.decode(this.historyTokens[index].token);
              if (tokenJson) {
                const proofs = token.getProofs(tokenJson);
                const proofsStore = useProofsStore();
                proofsStore.updateProofLabels(
                  proofs.map((p) => p.secret),
                  options.newLabel,
                );
              }
            } catch (e) {
              console.warn("Could not update proof labels", e);
            }
          }
          if (options.newDescription !== undefined) {
            this.historyTokens[index].description = options.newDescription;
            try {
              const tokenJson = token.decode(this.historyTokens[index].token);
              if (tokenJson) {
                const proofs = token.getProofs(tokenJson);
                const proofsStore = useProofsStore();
                proofsStore.updateProofDescriptions(
                  proofs.map((p) => p.secret),
                  options.newDescription,
                );
              }
            } catch (e) {
              console.warn("Could not update proof descriptions", e);
            }
          }
          if (options.newColor !== undefined) {
            this.historyTokens[index].color = options.newColor;
          }
        }

        const updated = this.historyTokens[index];
        persistUpdatedToken(updated);
        return updated;
      }

      return undefined;
    },

    findHistoryTokenBySecret(secret: string): HistoryToken | undefined {
      for (const ht of this.historyTokens) {
        try {
          const tokenJson = token.decode(ht.token);
          if (tokenJson) {
            const proofs = token.getProofs(tokenJson);
            if (proofs.some((p) => p.secret === secret)) {
              return ht;
            }
          }
        } catch (e) {
          console.warn("Could not decode token", e);
        }
      }
      return undefined;
    },

    editHistoryTokenBySecret(
      secret: string,
      options?: {
        newAmount?: number;
        addAmount?: number;
        newStatus?: "paid" | "pending";
        newToken?: string;
        newFee?: number;
        newLabel?: string;
        newColor?: string;
        newDescription?: string;
      },
    ): HistoryToken | undefined {
      const ht = this.findHistoryTokenBySecret(secret);
      if (!ht) return undefined;
      return this.editHistoryToken(ht.token, options);
    },
    setTokenPaid(token: string) {
      const index = this.historyTokens.findIndex(
        (t) => t.token === token && t.status == "pending",
      );
      if (index >= 0) {
        this.historyTokens[index].status = "paid";
        persistUpdatedToken(this.historyTokens[index]);
      }
    },
    deleteToken(token: string) {
      const index = this.historyTokens.findIndex((t) => t.token === token);
      if (index >= 0) {
        const [removed] = this.historyTokens.splice(index, 1);
        if (removed?.id) {
          void cashuDb.historyTokens.delete(removed.id);
        } else {
          void cashuDb.historyTokens
            .where("token")
            .equals(token)
            .delete();
        }
      }
    },
    changeHistoryTokenBucket({
      secrets,
      oldBucketId,
      newBucketId,
    }: {
      secrets?: string[];
      oldBucketId?: string;
      newBucketId: string;
    }) {
      this.historyTokens.forEach((ht) => {
        let update = false;
        if (oldBucketId && ht.bucketId === oldBucketId) {
          update = true;
        }
        if (!update && secrets && secrets.length) {
          try {
            const tokenJson = token.decode(ht.token);
            if (tokenJson) {
              const proofs = token.getProofs(tokenJson);
              if (proofs.some((p) => secrets.includes(p.secret))) {
                update = true;
              }
            }
          } catch (e) {
            console.warn("Could not decode token", e);
          }
        }
        if (update) {
          ht.bucketId = newBucketId;
          persistUpdatedToken(ht);
        }
      });
    },
    tokenAlreadyInHistory(tokenStr: string): HistoryToken | undefined {
      return this.historyTokens.find((t) => t.token === tokenStr);
    },
    decodeToken(encodedToken: string): Token | undefined {
      encodedToken = encodedToken.trim();
      if (!isValidTokenString(encodedToken)) {
        console.error("Invalid token string");
        return undefined;
      }
      try {
        const decoded = token.decode(encodedToken);
        const proofs = token.getProofs(decoded);
        if (!proofs || proofs.length === 0) {
          console.error("Decoded token contains no proofs");
          return undefined;
        }
        return decoded;
      } catch (e) {
        console.error(e);
        return undefined;
      }
    },
    async archiveOldPaidTokens(limit: number): Promise<number> {
      if (limit <= 0) {
        return 0;
      }

      const paidTokens = this.historyTokens
        .filter((t) => t.status === "paid" && !t.archived)
        .sort((a, b) =>
          (a.createdAt ?? safeDate(a.date)?.getTime() ?? 0) -
          (b.createdAt ?? safeDate(b.date)?.getTime() ?? 0),
        );

      if (paidTokens.length <= limit) {
        return 0;
      }

      const tokensToArchive = paidTokens.slice(0, paidTokens.length - limit);
      const archivedAt = new Date().toISOString();

      tokensToArchive.forEach((token) => {
        token.archived = true;
        token.archivedAt = archivedAt;
      });

      await cashuDb.transaction("rw", cashuDb.historyTokens, async () => {
        await Promise.all(
          tokensToArchive.map((token) =>
            updateTokenInDexie(token, { archived: true, archivedAt }),
          ),
        );
      });

      return tokensToArchive.length;
    },
  },
  getters: {
    canPasteFromClipboard() {
      return (
        window.isSecureContext &&
        navigator.clipboard &&
        navigator.clipboard.readText
      );
    },
  },
});

function currentDateStr() {
  return date.formatDate(new Date(), "YYYY-MM-DD HH:mm:ss");
}

function isValidTokenString(tokenStr: string): boolean {
  const prefixRegex = /^cashu[A-Za-z0-9][A-Za-z0-9_\-+=\/]*$/;
  return prefixRegex.test(tokenStr);
}

type TokensStoreState = {
  historyTokens: HistoryToken[];
};

let historyTokensStateRef: TokensStoreState | null = null;
let historyTokensSubscription: { unsubscribe(): void } | null = null;
let historyMigrationStarted = false;

function initializeHistoryTokensState(state: TokensStoreState) {
  historyTokensStateRef = state;

  if (!historyMigrationStarted) {
    historyMigrationStarted = true;
    void migrateHistoryTokensFromLocalStorage();
  }

  if (historyTokensSubscription) {
    return;
  }

  historyTokensSubscription = liveQuery(() => cashuDb.historyTokens.toArray()).subscribe({
    next: (rows) => {
      if (!historyTokensStateRef) {
        return;
      }
      const normalized = rows.map(normalizeHistoryToken);
      normalized.sort(
        (a, b) =>
          (a.createdAt ?? safeDate(a.date)?.getTime() ?? 0) -
          (b.createdAt ?? safeDate(b.date)?.getTime() ?? 0),
      );
      historyTokensStateRef.historyTokens = normalized;
    },
    error: (err) => console.error(err),
  });
}

async function migrateHistoryTokensFromLocalStorage() {
  if (typeof window === "undefined") {
    return;
  }
  const storageKey = "cashu.historyTokens";
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    const existingCount = await cashuDb.historyTokens.count();
    if (existingCount > 0) {
      window.localStorage.removeItem(storageKey);
      return;
    }

    const entries = Array.isArray(parsed) ? parsed : [];
    const now = Date.now();
    const normalized = entries
      .filter((entry) => typeof entry?.token === "string")
      .map((entry, index) => {
        const createdAt =
          typeof entry.createdAt === "number"
            ? entry.createdAt
            : safeDate(entry.date)?.getTime() ?? now + index;
        return {
          ...entry,
          id: entry.id ?? uuidv4(),
          archived: Boolean(entry.archived),
          archivedAt:
            entry.archivedAt !== undefined && entry.archivedAt !== null
              ? entry.archivedAt
              : null,
          createdAt,
        } as HistoryToken;
      });

    if (normalized.length) {
      await cashuDb.historyTokens.bulkPut(normalized as any);
    }
  } catch (err) {
    console.error("Failed to migrate history tokens", err);
  } finally {
    window.localStorage.removeItem(storageKey);
  }
}

function persistLatestToken(token: HistoryToken | undefined) {
  if (!token) {
    return;
  }
  const entry = withPersistDefaults(token);
  void cashuDb.historyTokens.put(entry as any);
}

function persistUpdatedToken(token: HistoryToken) {
  const entry = withPersistDefaults(token);
  void updateTokenInDexie(entry, entry);
}

async function updateTokenInDexie(
  token: HistoryToken,
  data: Partial<HistoryToken>,
) {
  const payload = { ...data } as any;
  if (token.id) {
    await cashuDb.historyTokens.update(token.id, payload);
    return;
  }
  await cashuDb.historyTokens
    .where("token")
    .equals(token.token)
    .modify((record) => Object.assign(record, payload));
}

function normalizeHistoryToken(token: HistoryToken): HistoryToken {
  const createdAt =
    typeof token.createdAt === "number"
      ? token.createdAt
      : safeDate(token.date)?.getTime();
  return {
    ...token,
    id: token.id ?? uuidv4(),
    archived: token.archived ?? false,
    archivedAt:
      token.archivedAt !== undefined && token.archivedAt !== null
        ? token.archivedAt
        : null,
    createdAt: createdAt ?? Date.now(),
  };
}

function withPersistDefaults(token: HistoryToken): HistoryToken {
  return {
    ...token,
    id: token.id ?? uuidv4(),
    archived: token.archived ?? false,
    archivedAt:
      token.archivedAt !== undefined && token.archivedAt !== null
        ? token.archivedAt
        : null,
    createdAt:
      typeof token.createdAt === "number"
        ? token.createdAt
        : safeDate(token.date)?.getTime() ?? Date.now(),
  };
}

function safeDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
