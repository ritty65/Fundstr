const SPLIT_NUT = 4;

export const SPLIT_SUPPORT_REQUIRED_MESSAGE =
  "Your active mint must support splitting ecash (NUT-04). Switch to a mint with split support and try again.";

type NutEntry = {
  supported?: boolean;
  disabled?: boolean;
  enabled?: boolean;
  [key: string]: unknown;
};

type MintInfoLike = {
  nut_supports?: unknown;
  nuts?: Record<string, unknown> | undefined;
};

export function resolveSupportedNuts(info: MintInfoLike | undefined | null): number[] {
  if (!info) {
    return [];
  }

  const resolved = new Set<number>();

  const { nut_supports: nutSupports, nuts } = info;

  if (Array.isArray(nutSupports)) {
    for (const value of nutSupports) {
      if (typeof value === "number" && Number.isFinite(value)) {
        resolved.add(value);
      }
    }
  }

  if (nuts && typeof nuts === "object") {
    for (const [key, entry] of Object.entries(nuts)) {
      const numeric = Number(key);
      if (!Number.isFinite(numeric)) {
        continue;
      }

      const details = (entry ?? {}) as NutEntry;
      if (details.disabled === true) {
        continue;
      }
      if (typeof details.supported === "boolean" && !details.supported) {
        continue;
      }
      resolved.add(numeric);
    }
  }

  return Array.from(resolved.values()).sort((a, b) => a - b);
}

export function mintSupportsSplit(
  info: MintInfoLike | undefined | null,
  supportedNuts: number[] = resolveSupportedNuts(info),
): boolean {
  if (supportedNuts.includes(SPLIT_NUT)) {
    return true;
  }

  const nuts = info?.nuts;
  if (!nuts || typeof nuts !== "object") {
    return false;
  }

  const splitEntryRaw =
    (nuts as Record<string, unknown>)["split"] ??
    (nuts as Record<string, unknown>)["Split"] ??
    (nuts as Record<string, unknown>)[SPLIT_NUT as unknown as string];

  if (typeof splitEntryRaw === "boolean") {
    return splitEntryRaw;
  }

  if (!splitEntryRaw || typeof splitEntryRaw !== "object") {
    return false;
  }

  const splitEntry = splitEntryRaw as NutEntry;
  if (splitEntry.disabled === true) {
    return false;
  }

  if (typeof splitEntry.supported === "boolean") {
    return splitEntry.supported;
  }

  if (typeof splitEntry.enabled === "boolean") {
    return splitEntry.enabled;
  }

  return true;
}

export { SPLIT_NUT };
