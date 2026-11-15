import { z } from "zod";

const id = z.string().min(1).max(100);
export const coachingSource = z.enum(["conversation", "meta", "whatsapp"]);
export type CoachingSource = z.infer<typeof coachingSource>;
export const evidenceSchema = z.object({
  messageId: id,
  quote: z.string().min(2).max(400),
});
export type MessageEvidence = z.infer<typeof evidenceSchema>;
export const lossCodes = [
  "price",
  "timing",
  "location",
  "trust",
  "service_mismatch",
  "other",
  "unknown",
] as const;
export const lossLabels: Record<(typeof lossCodes)[number], string> = {
  price: "價格顧慮",
  timing: "時間未配合",
  location: "地點未配合",
  trust: "信心或疑慮",
  service_mismatch: "服務未配合",
  other: "其他顧慮",
  unknown: "未能判斷",
};
export const learningSchema = z.object({
  kind: z.enum(["answer", "pattern", "gap"]),
  title: z.string().min(1).max(100),
  question: z.string().max(200),
  content: z.string().min(1).max(1600),
  evidence: z.array(evidenceSchema).min(1).max(4),
  knowledgeEvidence: z
    .array(z.object({ sourceId: id, quote: z.string().min(4).max(400) }))
    .max(4),
});
export const outputSchema = z.object({
  nextAction: z.object({
    title: z.string().min(1).max(100),
    reason: z.string().min(1).max(500),
    missingFields: z.array(z.string().min(1).max(80)).max(5),
    suggestedReply: z.string().max(1800),
    evidence: z.array(evidenceSchema).min(1).max(4),
    knowledgeEvidence: z
      .array(z.object({ sourceId: id, quote: z.string().min(4).max(400) }))
      .max(4),
  }),
  quality: z.object({
    status: z.enum(["reviewed", "insufficient"]),
    findings: z
      .array(
        z.object({
          code: z.enum([
            "unanswered",
            "unclear",
            "no_next_step",
            "empathy",
            "unsupported_claim",
            "other",
          ]),
          title: z.string().min(1).max(100),
          detail: z.string().min(1).max(500),
          suggestion: z.string().min(1).max(500),
          severity: z.enum(["attention", "suggestion"]),
          evidence: z.array(evidenceSchema).min(1).max(4),
        }),
      )
      .max(5),
    lossReason: z.object({
      code: z.enum(lossCodes),
      label: z.string().max(100),
      evidence: z.array(evidenceSchema).max(4),
    }),
  }),
  learning: z.array(learningSchema).max(4),
});
export type CoachingOutput = z.infer<typeof outputSchema>;
export type CoachingReview = {
  commandId: string;
  lossCode: (typeof lossCodes)[number];
  reason: string;
  dismissedFindingCodes: string[];
  actorName: string;
  createdAt: string;
};
export type LearningRecord = {
  analysisId: string;
  index: number;
  brandId: string;
  item: CoachingOutput["learning"][number];
  status: "suggested" | "adopted";
  articleId: string | null;
  createdAt: string;
  stale: boolean;
  verifiedBooking: boolean;
};
export type CoachingAnalysis = CoachingOutput & {
  id: string;
  brandId: string;
  source: CoachingSource;
  sourceId: string;
  createdAt: string;
  stale: boolean;
  outcome: { verifiedBooking: boolean; label: string };
  coverage: { messages: number; truncated: boolean; label: string };
  latestReview: CoachingReview | null;
  knowledgeRefs?: {
    id: string;
    revision: number;
    contentHash: string;
    validUntil: string;
  }[];
};
export type CoachingSourceOption = {
  source: CoachingSource;
  sourceId: string;
  brandId: string;
  label: string;
  preview: string;
};
export type CoachingPage = {
  analyses: CoachingAnalysis[];
  learning: LearningRecord[];
  sources: CoachingSourceOption[];
  canGenerate: boolean;
  canManage: boolean;
};
export const querySchema = z
  .object({
    brandId: id,
    source: coachingSource.optional(),
    sourceId: id.optional(),
  })
  .refine((v) => Boolean(v.source) === Boolean(v.sourceId));
export const commandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("analyze"),
      requestId: z.uuid(),
      brandId: id,
      source: coachingSource,
      sourceId: id,
    })
    .strict(),
  z
    .object({
      type: z.literal("adopt"),
      commandId: z.uuid(),
      analysisId: z.uuid(),
      index: z.number().int().min(0).max(3),
      title: z.string().trim().min(1).max(100),
      content: z.string().trim().min(1).max(1600),
      validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .strict(),
  z
    .object({
      type: z.literal("review"),
      commandId: z.uuid(),
      analysisId: z.uuid(),
      lossCode: z.enum(lossCodes),
      reason: z.string().trim().min(3).max(500),
      dismissedFindingCodes: z
        .array(outputSchema.shape.quality.shape.findings.element.shape.code)
        .max(6),
    })
    .strict(),
]);
export type CoachingCommand = z.infer<typeof commandSchema>;
export type CoachingMessage = {
  id: string;
  direction: "incoming" | "outgoing";
  body: string;
  at: number;
};
export type CoachingContext = {
  stamp: string;
  workspaceRevision: number;
  sourceRevision: number | null;
  verifiedBooking: boolean;
  label: string;
};
