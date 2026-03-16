<template>
  <q-page class="settings-page bg-surface-1 text-1 q-pa-md q-pa-lg-xl">
    <div class="settings-page__inner">
      <section class="settings-page__hero bg-surface-2 text-1">
        <div class="settings-page__hero-copy">
          <div class="settings-page__eyebrow">Control Center</div>
          <h1 class="text-h4 q-my-none">Settings &amp; Recovery</h1>
          <p class="text-body1 text-2 q-mb-none">
            Manage your backup, identity, relays, wallet integrations, and
            privacy defaults in one place.
          </p>
        </div>
        <div class="settings-page__hero-chips">
          <q-chip dense outline color="primary" text-color="primary"
            >Wallet backup</q-chip
          >
          <q-chip dense outline color="primary" text-color="primary"
            >Nostr identity</q-chip
          >
          <q-chip dense outline color="primary" text-color="primary"
            >Relay controls</q-chip
          >
        </div>
      </section>

      <SettingsView />
    </div>
  </q-page>
</template>

<script>
import { defineComponent } from "vue";
import SettingsView from "components/SettingsView.vue";

export default defineComponent({
  name: "ErrorNotFound",
  components: {
    SettingsView,
  },
});
</script>

<style scoped>
.settings-page {
  min-height: 100vh;
  background: radial-gradient(
      circle at top right,
      color-mix(in srgb, var(--accent-200) 24%, transparent),
      transparent 34%
    ),
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--surface-1) 97%, transparent),
      var(--surface-1)
    );
}

.settings-page__inner {
  width: min(100%, 70rem);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.settings-page__hero {
  border: 1px solid var(--surface-contrast-border);
  border-radius: 24px;
  padding: clamp(1.25rem, 3vw, 2rem);
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 1rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
}

.settings-page__hero-copy {
  flex: 1 1 26rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.settings-page__eyebrow {
  display: inline-flex;
  align-self: flex-start;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent-200) 35%, transparent);
  color: var(--accent-600);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.settings-page__hero-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  align-content: flex-start;
}

@media (max-width: 599px) {
  .settings-page__hero {
    border-radius: 20px;
  }
}
</style>
