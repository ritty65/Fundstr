export type SubscriptionFrequency = "weekly" | "biweekly" | "monthly";

export const FREQUENCY_TO_DAYS: Record<SubscriptionFrequency, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30, // calendar-aware; use addMonths for scheduling
};

export const CALENDAR_BASED_FREQUENCIES = new Set<SubscriptionFrequency>([
  "monthly",
]);

export function isCalendarBased(freq: SubscriptionFrequency): boolean {
  return CALENDAR_BASED_FREQUENCIES.has(freq);
}

export function frequencyToDays(freq: SubscriptionFrequency): number {
  return FREQUENCY_TO_DAYS[freq] || 30;
}

export function daysToFrequency(days: number): SubscriptionFrequency {
  if (days === 7) return "weekly";
  if (days === 14) return "biweekly";
  return "monthly";
}
