import { z } from "zod";
import { articleSchema } from "@/components/crm/studio/model";
import {
  answerSchema,
  validateAnswer,
  type AssistantInput,
  type LiveAnswer,
} from "@/lib/demo/ai-contract";
import { websitePrivacyHandoff } from "@/lib/web-chat/visitor-privacy";
import { detectIntent } from "@/components/crm/studio/engine";
const goal = z
  .enum(["answer", "book", "objection", "follow_up", "empathy", "concise"])
  .default("answer");
export const companyAIRequest = z.discriminatedUnion("source", [
  z
    .object({
      companyId: z.uuid(),
      requestId: z.uuid(),
      brandId: z.string().min(1).max(100),
      source: z.literal("playground"),
      goal,
      message: z.string().trim().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      companyId: z.uuid(),
      requestId: z.uuid(),
      brandId: z.string().min(1).max(100),
      source: z.literal("conversation"),
      goal,
      conversationId: z.string().min(1).max(100),
    })
    .strict(),
  z
    .object({
      companyId: z.uuid(),
      requestId: z.uuid(),
      brandId: z.string().min(1).max(100),
      source: z.enum(["meta", "whatsapp"]),
      goal,
      threadId: z.uuid(),
    })
    .strict(),
]);
export const groundedAnswerSchema = answerSchema.extend({
  sourceIds: answerSchema.shape.sourceIds.describe(
    "Exact approvedKnowledge article IDs supporting the reply. Every ID must also have an exact quote in evidence.",
  ),
  action: answerSchema.shape.action.describe(
    "Use reply for an answer supported by approved facts, including a draft that asks a clarifying question or explains activation limits. Use handoff if the required facts are missing or human review is requested.",
  ),
  evidence: z
    .array(
      z.object({
        sourceId: z
          .string()
          .max(100)
          .describe(
            "An exact approvedKnowledge article ID listed in sourceIds.",
          ),
        quote: z
          .string()
          .min(4)
          .max(600)
          .describe(
            "Copy one continuous substring from that article's content verbatim. Preserve every character, space and punctuation mark; do not paraphrase, combine sentences or add ellipses.",
          ),
      }),
    )
    .max(6),
  nextStep: z.string().min(1).max(300),
  interest: z.enum(["high", "medium", "low", "unknown"]),
});
export type CompanyAnswer = LiveAnswer & {
  goal?: import("./goals").ReplyGoal;
  requestId?: string;
  nextStep: string;
  interest: "high" | "medium" | "low" | "unknown";
  evidence: { sourceId: string; quote: string }[];
  review?: { handoffReasons: string[] };
};
export function hongKongDay(now: number) {
  return new Date(now + 8 * 3600000).toISOString().slice(0, 10);
}
export function approvedKnowledge(
  articles: z.infer<typeof articleSchema>[],
  companyId: string,
  brandId: string,
  now: number,
) {
  return articles.filter(
    (a) =>
      a.clientId === companyId &&
      a.brandId === brandId &&
      a.status === "approved" &&
      a.coaching?.kind !== "pattern" &&
      a.validUntil >= hongKongDay(now) &&
      Number.isFinite(Date.parse(a.validUntil + "T00:00:00Z")) &&
      new Date(a.validUntil + "T00:00:00Z").toISOString().slice(0, 10) ===
        a.validUntil,
  );
}
export function approvedStyleGuidance(
  articles: z.infer<typeof articleSchema>[],
  companyId: string,
  brandId: string,
  now: number,
) {
  // Reuse the same company, brand, approval and real-calendar expiration rules;
  // a learned communication pattern never becomes evidence for business facts.
  const patterns = articles.filter((a) => a.coaching?.kind === "pattern");
  return approvedKnowledge(
    patterns.map((a) => ({ ...a, coaching: undefined })),
    companyId,
    brandId,
    now,
  )
    .slice(0, 6)
    .map((a) => a.content.slice(0, 500));
}
export function retrieveKnowledge(
  articles: z.infer<typeof articleSchema>[],
  message: string,
) {
  const q = message.normalize("NFKC").toLocaleLowerCase();
  const ranked = articles
    .map((a, i) => ({
      a,
      i,
      score:
        a.keywords.reduce(
          (n, k) =>
            n + (q.includes(k.normalize("NFKC").toLocaleLowerCase()) ? 2 : 0),
          0,
        ) + (q.includes(a.title.toLocaleLowerCase()) ? 3 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.i - b.i);
  let chars = 0;
  const selected: typeof articles = [];
  for (const { a } of ranked) {
    if (selected.length >= 12) break;
    if (chars + a.content.length > 16000) continue;
    selected.push(a);
    chars += a.content.length;
  }
  return selected;
}
export const prices = (s: string) =>
  [
    ...s.matchAll(
      /(?:HK\$|HKD|\$|港幣)\s*(\d[\d,.]*)|(\d[\d,.]*)\s*(?:港元|元)|(?:收費|價錢|售價|報價|費用|定價)\s*(?:為|係|是|:|：)?\s*\$?(\d[\d,.]*)/gi,
    ),
  ].map((m) => Number((m[1] ?? m[2] ?? m[3]).replaceAll(",", "")));
export function inspectGroundedAnswer(
  output: z.infer<typeof groundedAnswerSchema>,
  input: AssistantInput,
  now: number,
  model: string,
  audience: "staff" | "website" = "staff",
) {
  const quotesValid = output.evidence.every((e) =>
    input.articles.some(
      (a) =>
        a.id === e.sourceId &&
        output.sourceIds.includes(a.id) &&
        a.content.includes(e.quote),
    ),
  );
  const evidenceIds = new Set(output.evidence.map((e) => e.sourceId));
  const quotedEverySource = output.sourceIds.every((id) => evidenceIds.has(id));
  const knownPrices = new Set(
    prices(
      input.articles
        .filter((a) => output.sourceIds.includes(a.id))
        .map((a) => a.content)
        .join("\n"),
    ),
  );
  const knownText = input.articles
    .filter((a) => output.sourceIds.includes(a.id))
    .map((a) => a.content + " " + a.source)
    .join("\n");
  const inventedPrice = prices(output.reply).some((n) => !knownPrices.has(n));
  const inventedLink = [
    ...output.reply.matchAll(/https?:\/\/[^\s<>「」]+/g),
  ].some((m) => !knownText.includes(m[0]));
  const topic = /地址|分店|邊度|位置|location/i.test(input.message)
    ? "location"
    : /營業|幾點|開門|hours/i.test(input.message)
      ? "hours"
      : "service";
  const policyHandoff =
    // Public admission already persists actual human requests/preferences. A
    // later question may mention the waiting colleague without requesting a
    // second transfer. Keep the existing sensitive-topic boundary in both modes.
    (audience === "website"
      ? websitePrivacyHandoff(input.message)
      : detectIntent(input.message) === "handoff") ||
    (output.intent === "faq" &&
      ((topic === "location" && !input.profile.allowLocation) ||
        (topic === "hours" && !input.profile.allowHours) ||
        (topic === "service" && !input.profile.allowService)));
  const invalid =
    policyHandoff ||
    !quotesValid ||
    !quotedEverySource ||
    inventedPrice ||
    inventedLink ||
    (output.action === "reply" && !output.evidence.length);
  const safe = invalid ? { ...output, action: "handoff" as const } : output;
  const result = validateAnswer(safe, { ...input, assist: true }, now, model);
  const issues = [
    ...(policyHandoff ? ["policy_handoff"] : []),
    ...(!quotesValid ? ["invalid_quotes"] : []),
    ...(!quotedEverySource ? ["unquoted_source"] : []),
    ...(inventedPrice ? ["invented_price"] : []),
    ...(inventedLink ? ["invented_link"] : []),
    ...(output.action === "reply" && !output.evidence.length
      ? ["missing_evidence"]
      : []),
    ...(output.action === "handoff" ? ["model_handoff"] : []),
    ...(output.confidence < 0.65 ? ["low_confidence"] : []),
    ...(output.sourceIds.some(
      (id) =>
        !approvedKnowledge(
          input.articles,
          input.articles[0]?.clientId ?? "",
          input.brandId,
          now,
        ).some((a) => a.id === id),
    )
      ? ["unknown_source"]
      : []),
    ...(output.intent === "faq" &&
    output.action === "reply" &&
    !output.sourceIds.length
      ? ["missing_source"]
      : []),
    ...(/(?:成功預約|預約已確認|已為你預約|保證有位|一定有位)/.test(
      output.reply,
    )
      ? ["unsupported_booking_confirmation"]
      : []),
  ];
  if (result.decision === "handoff" && !issues.length)
    issues.push("answer_safety_handoff");
  const answer: CompanyAnswer = {
    ...result,
    nextStep:
      result.decision === "handoff"
        ? "由同事核實資料及客戶需要後跟進。"
        : output.nextStep,
    interest: output.interest,
    evidence: result.decision === "handoff" ? [] : output.evidence,
    review: {
      handoffReasons:
        result.decision === "handoff"
          ? [
              ...new Set(
                issues.map((issue) => {
                  if (issue === "policy_handoff") {
                    if (
                      /退款|投訴|經理|醫生|懷孕|發炎|refund|complaint/i.test(
                        input.message,
                      )
                    )
                      return "查詢涉及投訴、退款或專業判斷，需要同事處理。";
                    if (detectIntent(input.message) === "handoff")
                      return "客人要求真人協助。";
                    return "呢類問題未獲品牌授權由 AI 處理。";
                  }
                  const reasons: Record<string, string> = {
                    invalid_quotes: "答案引文未能對應核准資料。",
                    unquoted_source: "部分來源未有可核對嘅支持引文。",
                    invented_price: "答案提到未有核准依據嘅價錢。",
                    invented_link: "答案提到未經核實嘅連結。",
                    missing_evidence: "未有足夠核准資料支持答案。",
                    model_handoff: "AI 判斷需要同事補充資料或作出決定。",
                    low_confidence: "目前資料不足以穩妥回答。",
                    unknown_source: "引用資料並非目前可用嘅品牌知識。",
                    missing_source: "未有足夠核准資料支持答案。",
                    unsupported_booking_confirmation:
                      "正式預約及即時名額需要同事核實。",
                    answer_safety_handoff: "答案仍需要同事核實後處理。",
                  };
                  return reasons[issue] ?? "答案仍需要同事核實後處理。";
                }),
              ),
            ]
          : [],
    },
  };
  return {
    answer,
    validation: {
      issues,
      modelAction: output.action,
      modelIntent: output.intent,
      confidence: output.confidence,
      sourceCount: output.sourceIds.length,
      quoteCount: output.evidence.length,
    },
  };
}
export function validateGroundedAnswer(
  output: z.infer<typeof groundedAnswerSchema>,
  input: AssistantInput,
  now: number,
  model: string,
): CompanyAnswer {
  return inspectGroundedAnswer(output, input, now, model).answer;
}
