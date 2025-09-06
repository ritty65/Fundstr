import { z } from "zod";

export const NutzapProfileSchema = z.object({
  p2pk: z.string(),
  mints: z.array(z.string()),
  relays: z.array(z.string()).optional(),
  tierAddr: z.string().optional(),
  v: z.number().optional(),
});

export type NutzapProfilePayload = z.infer<typeof NutzapProfileSchema>;
