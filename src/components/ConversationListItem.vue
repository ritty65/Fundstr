<template>
  <q-item
    clickable
    @click="onClick"
    class="conversation-item"
    :class="{ selected }"
    data-test="conversation-item"
    tabindex="0"
    :aria-label="isMini ? displayName : undefined"
  >
    <q-item-section avatar class="avatar-col">
      <q-avatar size="40px" class="relative-position">
        <template v-if="loaded && profile?.picture">
          <img :src="profile.picture" />
        </template>
        <template v-else-if="loaded">
          <div class="placeholder text-white text-body1">{{ initials }}</div>
        </template>
        <q-skeleton v-else type="circle" size="40px" />
        <q-badge
          class="status-dot"
          rounded
          :color="isOnline ? 'positive' : 'grey'"
        />
        <!-- Unread badge: overlay on avatar (top-right), always visible -->
        <q-badge
          v-if="unreadCount > 0"
          :label="unreadCount > 99 ? '99+' : String(unreadCount)"
          color="primary"
          text-color="white"
          class="unread-overlay"
          rounded
        />
      </q-avatar>
      <q-tooltip
        v-if="$q.screen.gt.xs && isMini"
        anchor="top middle"
        self="bottom middle"
        class="mini-tooltip"
      >
        {{ displayName }}
      </q-tooltip>
    </q-item-section>

    <!-- Main text column: name + time (top row), snippet (bottom row) -->
    <q-item-section v-if="!isMini" class="main-section">
      <template v-if="loaded">
        <div class="list-head row no-wrap items-center">
          <q-item-label
            class="title ellipsis"
            :class="{ 'text-weight-bold': unreadCount > 0 }"
            :title="displayName"
          >
            <q-icon
              v-if="isPinned"
              name="star"
              size="xs"
              color="warning"
              class="q-mr-xs"
            />
            {{ displayName }}
          </q-item-label>
          <span class="time text-caption">{{ timeExact }}</span>
        </div>

        <q-item-label caption class="snippet ellipsis" :title="displaySnippet">
          <template v-if="snippet.icon">
            <q-icon :name="snippet.icon" size="14px" class="q-mr-xs" />
          </template>
          {{ displaySnippet }}
        </q-item-label>
      </template>
      <template v-else>
        <q-skeleton type="text" width="80%" />
      </template>
    </q-item-section>

    <!-- Meta actions: overlayed; does not reserve width when hidden -->
    <q-item-section
      v-if="!isMini"
      side
      class="items-center meta-actions meta-actions--overlay"
    >
      <q-btn
        flat
        dense
        round
        size="sm"
        :icon="isPinned ? 'star' : 'star_outline'"
        class="action-btn"
        @click.stop="togglePin"
      >
        <q-tooltip>{{ isPinned ? "Unpin" : "Pin" }}</q-tooltip>
      </q-btn>
      <q-btn
        flat
        dense
        round
        icon="more_vert"
        class="q-ml-sm action-btn"
        @click.stop="menu = true"
        aria-label="Conversation options"
      >
        <q-tooltip>Options</q-tooltip>
      </q-btn>
      <q-menu v-model="menu" anchor="bottom right" self="top right">
        <q-list style="min-width: 120px">
          <q-item clickable v-close-popup @click.stop="togglePin">
            <q-item-section avatar>
              <q-icon :name="isPinned ? 'star' : 'star_outline'" />
            </q-item-section>
            <q-item-section>
              {{ isPinned ? "Unpin" : "Pin" }}
            </q-item-section>
          </q-item>
          <q-item clickable v-close-popup @click.stop="showRaw = !showRaw">
            <q-item-section avatar>
              <q-icon name="vpn_key" />
            </q-item-section>
            <q-item-section>View Raw Key</q-item-section>
          </q-item>
          <q-item clickable v-close-popup @click.stop="deleteItem">
            <q-item-section avatar>
              <q-icon name="delete" />
            </q-item-section>
            <q-item-section>Delete</q-item-section>
          </q-item>
        </q-list>
      </q-menu>
    </q-item-section>
  </q-item>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useQuasar, QBadge, QBtn } from "quasar";
import { useMessengerStore } from "src/stores/messenger";
import { useNostrStore } from "src/stores/nostr";
import { parseMessageSnippet } from "src/utils/message-snippet";

/**
 * Exact time formatter for drawer:
 *  - Today: HH:mm (24/12h per locale)
 *  - Same year: "MMM d"
 *  - Else: "MMM d, yyyy"
 * 'lastMsg' prop (already provided here) contains created_at in seconds (Nostr).
 */
function formatExactTime(createdAt?: number | string | null): string {
  if (!createdAt && createdAt !== 0) return "";
  const sec = Number(createdAt);
  const d = new Date((isFinite(sec) ? sec : Date.now() / 1000) * 1000);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const sameYear = d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  }
  if (sameYear) {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
    }).format(d);
  }
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

/**
 * Humanize drawer snippets so we never show raw JSON fragments.
 * Heuristics-only (no business logic change):
 *  - JSON with token/proofs/mint/cashu  -> "Sent a Cashu token"
 *  - JSON with cashu_subscription/recurrence -> "Subscription payment"
 *  - Any text containing 'subscription' -> "Subscription payment"
 *  - Very long http(s) link -> "Link"
 *  - Otherwise: the original text trimmed.
 */
function humanizeSnippet(raw: unknown): string {
  if (!raw) return "";
  const t = String(raw).trim();
  // Try JSON first (ignore errors)
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      const obj = JSON.parse(t);
      if (obj && typeof obj === "object") {
        const o: any = obj;
        if (o.cashu || o.token || o.proofs || o.mint)
          return "Sent a Cashu token";
        if (o.cashu_subscription || o.subscription || o.recurrence)
          return "Subscription payment";
      }
    } catch {
      // fall through
    }
  }
  // Heuristics on plain text
  if (/"token"\s*:/.test(t) || /\bcashu\b/i.test(t))
    return "Sent a Cashu token";
  if (/\bsubscription\b/i.test(t)) return "Subscription payment";
  if (/https?:\/\/\S{40,}/i.test(t)) return "Link";
  return t;
}

const props = defineProps({
  pubkey: { type: String, required: true },
  lastMsg: { type: Object as () => any, default: () => ({}) },
  selected: { type: Boolean, default: false },
});

const emit = defineEmits(["click", "pin", "delete"]);

const messenger = useMessengerStore();
const nostr = useNostrStore();
const $q = useQuasar();

const isOnline = computed(() => messenger.connected);
const isPinned = computed(() => messenger.pinned[props.pubkey]);
const unreadCount = computed(() => messenger.unreadCounts[props.pubkey] || 0);
const selected = computed(() => props.selected);
const isMini = computed(() => messenger.drawerMini);

const profile = computed(() => {
  const entry: any = (nostr.profiles as any)[props.pubkey];
  return entry?.profile ?? entry ?? {};
});

const alias = computed(() => messenger.aliases[props.pubkey]);
const profileName = computed(() => {
  const p: any = profile.value;
  return (
    p?.name ||
    p?.displayName ||
    p?.display_name ||
    props.pubkey.slice(0, 8) + "…"
  );
});
const displayName = computed(() => alias.value || profileName.value);

const initials = computed(() => {
  const name = displayName.value;
  const words = name.split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => w[0]);
  return letters.join("").toUpperCase();
});

// consider profile fetched once the key exists, even if it has no fields
const loaded = computed(() => profile.value !== undefined);

const snippet = computed(() =>
  parseMessageSnippet(props.lastMsg?.content || ""),
);

// Build display snippet (we already humanize elsewhere)
const displaySnippet = computed(() => humanizeSnippet(snippet.value?.text));

// Exact time for the last message
const timeExact = computed(() => {
  const ts = (props.lastMsg &&
    (props.lastMsg.created_at ?? props.lastMsg.timestamp)) as any;
  return formatExactTime(ts);
});

const showRaw = ref(false);
const menu = ref(false);

const onClick = () => emit("click", nostr.resolvePubkey(props.pubkey));
const togglePin = () => emit("pin", nostr.resolvePubkey(props.pubkey));
const deleteItem = () => emit("delete", nostr.resolvePubkey(props.pubkey));
</script>

<style scoped>
.conversation-item {
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  padding: 10px 12px;
  border-radius: 8px;
  display: flex;
  gap: 8px;
  border-left: 3px solid transparent;
  overflow-x: hidden;
  min-width: 0;
  box-sizing: border-box;
  position: relative; /* enable overlay positioning for actions */
  /* Let each row respond to its own inline size (tracks drawer width) */
  container-type: inline-size;
}

/* Unread badge overlay on avatar (top-right) */
.unread-overlay {
  position: absolute;
  top: -3px;
  right: -3px;
  z-index: 1;
  min-width: 18px;
  height: 18px;
  line-height: 18px;
  padding: 0 4px;
  font-size: 10px;
  font-weight: 700;
  box-shadow: 0 0 0 2px var(--q-color-dark), 0 2px 4px rgba(0, 0, 0, 0.15);
  pointer-events: none; /* don’t block avatar clicks */
}
.conversation-item.selected {
  background-color: color-mix(in srgb, var(--q-primary), transparent 92%);
}
.conversation-item:focus {
  border-left: 2px solid var(--q-primary);
}
.placeholder {
  background: var(--divider-color);
  width: 100%;
  height: 100%;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.snippet {
  font-size: 0.82rem;
  line-height: 1.3;
  white-space: normal;
  /* Prefer natural word boundaries; only break inside very long strings if needed */
  overflow-wrap: break-word;
  word-break: normal;
  hyphens: none;
  opacity: 0.92; /* subtle contrast bump */
  /* Clamp to 2 lines; no height jitter for virtual scroll */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  max-height: calc(1.3em * 2);
}

/* Safety: links inside snippets (long URLs) should also break gracefully */
.snippet a {
  overflow-wrap: anywhere;
  word-break: break-all;
}

.conversation-item .ellipsis {
  flex: 1;
  min-width: 0;
}

.status-dot {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--q-color-white);
}

/* Actions overlay: remove from layout flow so text gets the space.
   Anchored to row's right edge and vertically centered. */
.meta-actions--overlay {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: 4px;
  pointer-events: auto;
}

/* Base: ensure icon buttons can actually shrink when container is narrow */
.action-btn {
  min-width: 0;
  padding: 0;
}
.action-btn .q-icon {
  line-height: 1;
}

/* Reveal-on-hover/focus behavior (desktop only) */
@media (hover: hover) and (pointer: fine) {
  .meta-actions--overlay {
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.15s ease;
  }
  .conversation-item:hover .meta-actions--overlay,
  .conversation-item:focus-within .meta-actions--overlay {
    opacity: 1;
    visibility: visible;
  }
}

/* Container-responsive sizing based on row width (i.e., drawer width) */
@container (max-width: 420px) {
  .action-btn {
    width: 28px;
    height: 28px;
  }
  .action-btn .q-icon {
    font-size: 18px;
  }
  /* tighten spacing between actions */
  .action-btn + .action-btn {
    margin-left: 2px !important;
  }
}

@container (max-width: 360px) {
  .action-btn {
    width: 24px;
    height: 24px;
  }
  .action-btn .q-icon {
    font-size: 16px;
  }
}

/* Container-responsive sizing based on row width (i.e., drawer width) */
@container (max-width: 420px) {
  .unread-overlay {
    min-width: 16px;
    height: 16px;
    line-height: 16px;
    font-size: 9px;
    top: -2px;
    right: -2px;
  }
}
@container (max-width: 360px) {
  .unread-overlay {
    min-width: 14px;
    height: 14px;
    line-height: 14px;
    font-size: 8px;
    top: -1px;
    right: -1px;
  }
}

/* Touch devices: keep tap targets comfy (badge still non-interactive) */
@media (hover: none) and (pointer: coarse) {
  .action-btn {
    width: 32px;
    height: 32px;
  }
  .unread-overlay {
    min-width: 20px;
    height: 20px;
    line-height: 20px;
    font-size: 11px;
  }
  .conversation-item {
    padding-right: 48px;
  } /* reserve space so overlay doesn't obscure text */
}

/* Main content column (title + time / snippet) */
.main-section {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.list-head {
  min-width: 0;
}
.title {
  font-size: 0.95rem;
  line-height: 1.25;
  min-width: 0;
}
.time {
  margin-left: 8px;
  white-space: nowrap;
  opacity: 0.65;
}
@container (max-width: 360px) {
  /* Hide time on very narrow drawers to favor text */
  .time {
    display: none;
  }
}

/* Mini (collapsed) drawer polish */
.drawer-collapsed .conversation-item {
  justify-content: center;
  align-items: center;
  height: 60px;
  padding: 0;
  gap: 0;
  border: none;
  border-left-color: transparent;
}
.drawer-collapsed .avatar-col,
.drawer-collapsed .q-item__section--avatar {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
}
.drawer-collapsed .conversation-item .unread-overlay {
  position: absolute;
  top: 6px;
  right: 6px;
  transform: translate(25%, -25%);
  box-shadow: 0 0 0 2px var(--q-color-dark);
}
.mini-tooltip {
  font-size: 12px;
  line-height: 1.2;
  max-width: 220px;
  white-space: normal;
}
</style>
