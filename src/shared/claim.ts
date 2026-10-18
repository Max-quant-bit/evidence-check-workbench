import { z } from "zod";

export const evidenceClaimSchema = z
  .object({
    side: z.enum(["affirmative", "negative", "neutral"]),
    originalText: z.string().min(1),
    claim: z.string().min(1),
    entities: z.array(z.string()),
    numbers: z.array(z.string()),
    dates: z.array(z.string()),
    allegedSource: z.string().nullable(),
    documentName: z.string().min(1),
    page: z.number().int().positive().nullable(),
    paragraph: z.number().int().positive(),
  })
  .strict();

export const extractionResultSchema = z.array(evidenceClaimSchema);

export type EvidenceClaim = z.infer<typeof evidenceClaimSchema>;
