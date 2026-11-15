import { z } from "zod";

export const commentObjectId = z
  .string()
  .regex(/^[1-9]\d{0,49}(?:_[1-9]\d{0,49})?$/);
const clean = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => s.isWellFormed());
export const socialRuleDefinition = z
  .object({
    id: z.uuid(),
    revision: z.number().int().nonnegative(),
    connectionId: z.uuid(),
    brandId: clean(100),
    name: clean(100),
    postId: commentObjectId,
    keywords: z
      .array(clean(80))
      .min(1)
      .max(20)
      .refine((a) => new Set(a.map(normalizeComment)).size === a.length),
    match: z.enum(["any", "all"]),
    body: clean(1000),
    enabled: z.boolean(),
  })
  .strict();
export const socialCommentAction = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("save"),
      commandId: z.uuid(),
      definition: socialRuleDefinition,
    })
    .strict(),
  z
    .object({
      action: z.literal("toggle"),
      commandId: z.uuid(),
      id: z.uuid(),
      revision: z.number().int().positive(),
      enabled: z.boolean(),
    })
    .strict(),
  z
    .object({ action: z.literal("retry"), commandId: z.uuid(), id: z.uuid() })
    .strict(),
]);
export type SocialRuleDraft = z.infer<typeof socialRuleDefinition>;
export function normalizeComment(text: string) {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/\s+/gu, " ")
    .trim();
}
export function safeSocialPostUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      ![
        "facebook.com",
        "www.facebook.com",
        "instagram.com",
        "www.instagram.com",
      ].includes(url.hostname)
    )
      return null;
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}
export function commentMatches(
  text: string,
  keywords: string[],
  mode: "any" | "all",
) {
  const normalized = normalizeComment(text);
  const matches = keywords.map((word) =>
    normalized.includes(normalizeComment(word)),
  );
  return (
    matches.length > 0 &&
    (mode === "all" ? matches.every(Boolean) : matches.some(Boolean))
  );
}
export type SocialRule = SocialRuleDraft & {
  channel: "messenger" | "instagram";
  permalink: string | null;
  verifiedAt: string | null;
  createdAt: string;
};
export type SocialCommentDelivery = {
  id: string;
  brandId: string;
  seq: string;
  ruleId: string;
  ruleName: string;
  channel: "messenger" | "instagram";
  comment: string;
  postId: string;
  permalink: string | null;
  state:
    | "queued"
    | "checking"
    | "sending"
    | "accepted"
    | "failed"
    | "uncertain"
    | "skipped";
  reason: string | null;
  body: string;
  providerId: string | null;
  createdAt: string;
  attemptedAt: string | null;
  canRetry: boolean;
};
export type SocialCommentsPage = {
  scopeStamp?: string;
  canManage: boolean;
  automationsPaused: boolean;
  brands: { id: string; name: string }[];
  connections: {
    id: string;
    brandId: string;
    channel: "messenger" | "instagram";
    label: string;
    enabled: boolean;
  }[];
  rules: SocialRule[];
  deliveries: SocialCommentDelivery[];
  nextCursor: string | null;
};
