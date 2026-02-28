const MIN_PIN_LENGTH = 6;

export function normalizePin(pin: string): string {
  return pin?.trim() ?? "";
}

export function assertValidPin(pin: string): string {
  const normalizedPin = normalizePin(pin);

  if (!normalizedPin || normalizedPin.length < MIN_PIN_LENGTH) {
    throw new Error(`PIN must be at least ${MIN_PIN_LENGTH} characters long.`);
  }

  if (!/\d/.test(normalizedPin)) {
    throw new Error("PIN must contain at least one number.");
  }

  const uniqueChars = new Set(normalizedPin.split(""));
  if (uniqueChars.size < 2) {
    throw new Error("PIN cannot reuse the same character for every position.");
  }

  return normalizedPin;
}

