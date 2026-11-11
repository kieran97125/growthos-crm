import { z } from "zod";
import { articleSchema, botSchema } from "@/components/crm/studio/model";
import type { AssistantResult } from "@/components/crm/studio/engine";
export const assistantRequest = z.object({
  message: z.string().min(1).max(2000),
  name: z.string().max(80),
  brandId: z.enum(["nova-studio", "nova-care"]),
  profile: botSchema,
  articles: z.array(articleSchema).max(30),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(1500),
      }),
    )
    .max(12),
  withinWindow: z.boolean(),
  humanOwned: z.boolean(),
  businessHours: z.boolean(),
  assist: z.boolean().optional(),
});
export type AssistantInput = z.infer<typeof assistantRequest>;
export const answerSchema = z.object({
  intent: z.enum(["faq", "booking", "handoff"]),
  action: z.enum(["reply", "handoff"]),
  reply: z.string().max(1500),
  summary: z.string().max(600),
  sourceIds: z.array(z.string()).max(6),
  missing: z.array(z.string().max(80)).max(6),
  confidence: z.number().min(0).max(1),
});
export type LiveAnswer = AssistantResult & {
  engine: "ai" | "demo" | "policy";
  model?: string;
};
export function validateAnswer(
  output: z.infer<typeof answerSchema>,
  input: AssistantInput,
  now: number,
  model: string,
): LiveAnswer {
  const today = new Date(now + 8 * 3600000).toISOString().slice(0, 10),
    allowed = input.articles.filter(
      (a) =>
        a.brandId === input.brandId &&
        a.status === "approved" &&
        a.validUntil >= today,
    );
  const sources = output.sourceIds.map((id) =>
    allowed.find((a) => a.id === id),
  );
  const badSources =
    sources.some((a) => !a) ||
    (output.intent === "faq" && output.action === "reply" && !sources.length);
  const amounts = [
    ...output.reply.matchAll(/(?:HK\$|\$)\s*[\d,]+(?:\.\d+)?/g),
  ].map((m) => m[0].replace(/\s|,/g, ""));
  const known = sources
    .flatMap((a) => (a ? [a.content.replace(/\s|,/g, "")] : []))
    .join("\n");
  const unsafe =
    amounts.some((v) => !known.includes(v)) ||
    /(?:成功預約|預約已確認|已為你預約|保證有位|一定有位)/.test(output.reply);
  const handoff =
    badSources ||
    unsafe ||
    output.confidence < 0.65 ||
    output.action === "handoff";
  const auto =
    !input.assist &&
    (input.profile.mode === "bounded" ||
      (input.profile.mode === "afterhours" && !input.businessHours)) &&
    output.intent === "faq";
  return {
    engine: "ai",
    model,
    intent: handoff ? "handoff" : output.intent,
    decision: handoff ? "handoff" : auto ? "auto-demo" : "draft",
    reply: handoff
      ? "收到，我會將你嘅查詢同已提供嘅資料交畀同事核實，再喺對話內跟進。"
      : output.reply,
    reason: handoff
      ? "資料依據、內容檢查或回答信心未達要求，已轉真人。"
      : output.intent === "booking"
        ? "AI 整理預約意向及已知資料；正式時段仍由同事核實。"
        : auto
          ? "AI 已根據核准品牌知識回覆；本次只進入 Demo 對話。"
          : "AI 已準備回覆建議，由同事修改後傳送。",
    summary: output.summary,
    sources: handoff
      ? []
      : sources.flatMap((a) =>
          a
            ? [
                {
                  id: a.id,
                  title: a.title,
                  revision: a.revision,
                  source: a.source,
                },
              ]
            : [],
        ),
    missing: output.missing,
  };
}
