export interface NutzapProfilePayload {
  p2pk: string;
  mints: string[];
  relays?: string[];
  tierAddr?: string;
  v?: number;
}

type SafeParseResult =
  | { success: true; data: NutzapProfilePayload }
  | { success: false; error: Error };

function validateNutzapProfile(input: unknown): SafeParseResult {
  if (typeof input !== "object" || input === null) {
    return { success: false, error: new Error("Profile payload must be an object") };
  }

  const candidate = input as Record<string, unknown>;

  if (typeof candidate.p2pk !== "string" || candidate.p2pk.length === 0) {
    return { success: false, error: new Error("Profile payload missing p2pk string") };
  }

  if (!Array.isArray(candidate.mints)) {
    return { success: false, error: new Error("Profile payload mints must be an array") };
  }
  const mintsSource = candidate.mints.every(
    (item) => typeof item === "string" && item.length > 0,
  )
    ? (candidate.mints as string[])
    : undefined;
  if (!mintsSource) {
    return { success: false, error: new Error("Profile payload mints must be strings") };
  }
  const mints = [...mintsSource];

  let relays: string[] | undefined;
  if (candidate.relays !== undefined) {
    if (!Array.isArray(candidate.relays)) {
      return { success: false, error: new Error("Profile payload relays must be an array") };
    }
    if (!candidate.relays.every((item) => typeof item === "string" && item.length > 0)) {
      return { success: false, error: new Error("Profile payload relays must be strings") };
    }
    relays = [...(candidate.relays as string[])];
  }
  const tierAddr = typeof candidate.tierAddr === "string" && candidate.tierAddr.length > 0
    ? candidate.tierAddr
    : undefined;
  const version = typeof candidate.v === "number" ? candidate.v : undefined;

  return {
    success: true,
    data: {
      p2pk: candidate.p2pk,
      mints,
      relays,
      tierAddr,
      v: version,
    },
  };
}

export const NutzapProfileSchema = {
  parse(input: unknown): NutzapProfilePayload {
    const result = validateNutzapProfile(input);
    if (!result.success) {
      throw result.error;
    }
    return result.data;
  },
  safeParse(input: unknown): SafeParseResult {
    return validateNutzapProfile(input);
  },
};
