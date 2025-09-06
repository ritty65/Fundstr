import { z } from "zod";
import { ensureCompressed } from "src/utils/ecash";

const hexKey = z
  .string()
  .regex(/^[0-9a-fA-F]{64,66}$/)
  .transform((v) => ensureCompressed(v));

export const NutzapProfile10019Schema = z.object({
  p2pk: hexKey,
  mints: z.array(z.string().url()).min(1),
  relays: z.array(z.string().url()).optional(),
  meta: z.record(z.any()).optional(),
  tierAddr: z.string().optional(),
});

export type NutzapProfilePayload = z.infer<typeof NutzapProfile10019Schema>;

const TierSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    price_sats: z.number().int().positive().optional(),
    price: z.number().positive().optional(),
    frequency: z.string(),
    benefits: z
      .array(z.string().min(1))
      .optional()
      .transform((b) => (b ? b.map((s) => s.trim()).filter(Boolean) : b)),
    media: z.string().url().optional(),
  })
  .refine((t) => t.price_sats !== undefined || t.price !== undefined, {
    message: "price or price_sats required",
  });

export const TierDefinition30019Schema = z.array(TierSchema).min(1);
