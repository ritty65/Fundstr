<template>
  <q-dialog v-model="model">
    <q-card class="setup-dialog bg-surface-2 text-1">
      <q-card-section class="setup-dialog__header">
        <div class="setup-dialog__eyebrow">Before you continue</div>
        <div class="text-h6">Finish setup to support this creator</div>
        <p class="text-body2 text-2 q-mb-none">
          {{ setupSummary }}
        </p>
      </q-card-section>

      <q-card-section class="setup-dialog__steps">
        <div class="setup-step bg-surface-1 text-1">
          <div class="setup-step__number">1</div>
          <div class="setup-step__content">
            <div class="setup-step__title">
              Create or import your Nostr identity
            </div>
            <div class="text-caption text-2">
              Needed for direct messages, subscription delivery, and private
              creator support.
            </div>
          </div>
        </div>
        <div class="setup-step bg-surface-1 text-1">
          <div class="setup-step__number">2</div>
          <div class="setup-step__content">
            <div class="setup-step__title">Finish wallet setup</div>
            <div class="text-caption text-2">
              Add a mint and wallet funding path so Fundstr can lock or deliver
              support payments.
            </div>
          </div>
        </div>
      </q-card-section>

      <q-card-actions align="right" class="q-gutter-sm setup-dialog__actions">
        <q-btn flat no-caps label="Not now" @click="close" />
        <q-btn
          outline
          no-caps
          color="primary"
          label="Create / import identity"
          @click="gotoNostr"
        />
        <q-btn
          class="setup-btn"
          no-caps
          label="Finish wallet setup"
          @click="gotoWelcome"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { defineComponent, computed } from "vue";
import { useRouter, useRoute } from "vue-router";

export default defineComponent({
  name: "SetupRequiredDialog",
  props: {
    modelValue: { type: Boolean, required: true },
    tierId: { type: String, required: false },
    tierName: { type: String, required: false },
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    const router = useRouter();
    const route = useRoute();

    const model = computed({
      get: () => props.modelValue,
      set: (v: boolean) => emit("update:modelValue", v),
    });

    const setupSummary = computed(() =>
      props.tierName
        ? `You need a ready identity and wallet before subscribing to ${props.tierName}.`
        : "You need a ready identity and wallet before subscribing or sending support.",
    );

    const close = () => {
      model.value = false;
    };

    const gotoNostr = () => {
      router.push({
        path: "/nostr-login",
        query: {
          redirect: route.fullPath,
          tierId: props.tierId,
        },
      });
    };

    const gotoWelcome = () => {
      router.push({
        path: "/welcome",
        query: {
          redirect: route.fullPath,
          tierId: props.tierId,
        },
      });
    };

    return { model, setupSummary, close, gotoNostr, gotoWelcome };
  },
});
</script>

<style scoped>
.setup-dialog {
  width: min(100%, 34rem);
  border-radius: 22px;
}

.setup-dialog__header {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.setup-dialog__eyebrow {
  display: inline-flex;
  align-self: flex-start;
  padding: 0.3rem 0.65rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent-200) 30%, transparent);
  color: var(--accent-600);
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.setup-dialog__steps {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.setup-step {
  display: flex;
  gap: 0.9rem;
  padding: 0.9rem 1rem;
  border-radius: 16px;
  border: 1px solid var(--surface-contrast-border);
}

.setup-step__number {
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-weight: 700;
  color: var(--accent-600);
  background: color-mix(in srgb, var(--accent-200) 30%, transparent);
  flex-shrink: 0;
}

.setup-step__content {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.setup-step__title {
  font-weight: 700;
}

.setup-dialog__actions {
  padding-top: 0;
}

.setup-btn {
  background-color: var(--accent-500);
  color: var(--text-inverse);
}

.setup-btn:hover,
.setup-btn:active {
  background-color: var(--accent-600);
}

@media (max-width: 599px) {
  .setup-dialog__actions {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
