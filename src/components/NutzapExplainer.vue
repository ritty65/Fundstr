<template>
  <section class="nutzap-explainer bg-surface-2 text-1" aria-labelledby="nutzap-explainer-heading">
    <div class="nutzap-explainer__header">
      <h3 id="nutzap-explainer-heading" class="nutzap-explainer__title">
        {{ t("FindCreators.explainers.heading") }}
      </h3>
      <p class="nutzap-explainer__intro text-2">
        {{ t("FindCreators.explainers.intro") }}
      </p>
    </div>
    <q-timeline color="accent" layout="comfortable" class="nutzap-explainer__timeline">
      <q-timeline-entry
        v-for="step in steps"
        :key="step.key"
        :title="step.title"
        class="nutzap-explainer__entry"
      >
        <p class="nutzap-explainer__body text-2">{{ step.body }}</p>
      </q-timeline-entry>
    </q-timeline>
    <div v-if="isGuest" class="nutzap-explainer__cta">
      <q-btn
        color="primary"
        unelevated
        class="nutzap-explainer__cta-btn"
        :label="t('FindCreators.explainers.ctaLabel')"
        :aria-label="t('FindCreators.explainers.ctaAria')"
        @click="emit('start-onboarding')"
      />
      <p class="nutzap-explainer__cta-hint text-2">
        {{ t("FindCreators.explainers.ctaHint") }}
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";

defineOptions({ name: "NutzapExplainer" });

const props = defineProps<{ isGuest?: boolean }>();
const emit = defineEmits<{ (e: "start-onboarding"): void }>();

const { t } = useI18n();

const stepKeys = ["subscriptions", "trustedMints", "relays"] as const;

type StepKey = (typeof stepKeys)[number];

type StepContent = { title: string; body: string; key: StepKey };

const steps = computed<StepContent[]>(() =>
  stepKeys.map((key) => ({
    key,
    title: t(`FindCreators.explainers.steps.${key}.title`),
    body: t(`FindCreators.explainers.steps.${key}.body`),
  })),
);

const isGuest = computed(() => props.isGuest === true);
</script>

<style scoped>
.nutzap-explainer {
  border: 1px solid var(--surface-contrast-border);
  border-radius: 1rem;
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.nutzap-explainer__header {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.nutzap-explainer__title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.nutzap-explainer__intro {
  margin: 0;
  line-height: 1.45;
}

.nutzap-explainer__timeline {
  padding-left: 0;
}

.nutzap-explainer__entry :deep(.q-timeline__subtitle) {
  font-weight: 600;
  color: var(--text-1);
}

.nutzap-explainer__body {
  margin: 0.35rem 0 0;
  line-height: 1.5;
}

.nutzap-explainer__cta {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.nutzap-explainer__cta-btn {
  align-self: flex-start;
}

.nutzap-explainer__cta-hint {
  margin: 0;
}

@media (max-width: 600px) {
  .nutzap-explainer {
    padding: 1rem 1.25rem;
  }
}
</style>
