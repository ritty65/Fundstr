import type { SubscriptionFrequency } from "src/constants/subscriptionFrequency";
import type { Tier } from "src/stores/types";

const VALID_FREQUENCIES: SubscriptionFrequency[] = [
  "weekly",
  "biweekly",
  "monthly",
];

export function normalizeTierFrequency(
  cadence: unknown,
): SubscriptionFrequency {
  if (typeof cadence !== "string") {
    return "monthly";
  }
  const normalized = cadence.trim().toLowerCase();
  if (normalized === "weekly") return "weekly";
  if (normalized === "biweekly" || normalized === "bi-weekly" || normalized === "fortnightly") {
    return "biweekly";
  }
  if (normalized === "monthly") return "monthly";
  return "monthly";
}

export function isValidTier(candidate: unknown): candidate is Tier {
  if (!candidate || typeof candidate !== "object") {
    return false;
  }

  const tier = candidate as Tier & { title?: string; price?: number };

  if (typeof tier.id !== "string" || !tier.id.trim()) {
    return false;
  }

  const nameOrTitle =
    typeof tier.name === "string"
      ? tier.name
      : typeof tier.title === "string"
        ? tier.title
        : null;
  if (nameOrTitle === null) {
    return false;
  }

  const price =
    typeof tier.price_sats === "number"
      ? tier.price_sats
      : typeof tier.price === "number"
        ? tier.price
        : null;
  if (price === null || !Number.isFinite(price) || price < 0) {
    return false;
  }

  if (
    tier.frequency !== undefined &&
    tier.frequency !== null &&
    !VALID_FREQUENCIES.includes(tier.frequency as SubscriptionFrequency)
  ) {
    return false;
  }

  if (tier.media !== undefined && tier.media !== null && !Array.isArray(tier.media)) {
    return false;
  }

  return true;
}
