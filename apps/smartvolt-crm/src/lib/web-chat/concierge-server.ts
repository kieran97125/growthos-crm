import "server-only";
import { after } from "next/server";
import { z } from "zod";
import { database } from "@/lib/saas/database";
import { articleSchema, botSchema } from "@/components/crm/studio/model";
import { approvedKnowledge, retrieveKnowledge } from "@/lib/ai/protocol";
import { generateCompanyAnswer } from "@/lib/ai/generate";
import { aiModel } from "@/lib/ai/server";
import { classifyAIError } from "@/lib/ai/errors";
import type { AssistantInput } from "@/lib/demo/ai-contract";

/** Only a durable, server-admitted visitor turn can cause one model dispatch. */
export async function processWebsiteTurn(company: string, message: string) {
  const db = database();
  const claim = await db.rpc("sv_web_chat_c_claim", {
    p_company: company,
    p_message: message,
    p_model: aiModel(),
  });
  if (claim.error) throw new Error("website_c_claim_pending");
  if (!claim.data?.dispatch) return;
  let result: Awaited<ReturnType<typeof generateCompanyAnswer>> | null = null;
  let error: string | null = null;
  try {
    const data = claim.data;
    const articles = retrieveKnowledge(
      approvedKnowledge(
        z.array(articleSchema).max(100).parse(data.articles),
        company,
        data.brandId,
        Date.now(),
      ),
      data.message,
    );
    if (!articles.length) throw new Error("website_c_knowledge_required");
    const input: AssistantInput = {
      message: z.string().min(1).max(2000).parse(data.message),
      name: z.string().max(60).parse(data.name) || "訪客",
      brandId: data.brandId,
      profile: botSchema.parse(data.profile),
      articles,
      history: z
        .array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string().max(1500),
          }),
        )
        .max(12)
        .parse(data.history),
      assist: true,
      withinWindow: true,
      humanOwned: false,
      businessHours: true,
    };
    result = await generateCompanyAnswer(
      input,
      aiModel()!,
      data.companyName,
      Date.now(),
      "answer",
      "website",
    );
  } catch (e) {
    error = classifyAIError(e);
  }
  const finish = await db.rpc("sv_web_chat_c_finish", {
    p_company: company,
    p_message: message,
    p_result: result?.answer ?? null,
    p_error: error,
    p_input: result?.inputTokens ?? null,
    p_output: result?.outputTokens ?? null,
  });
  if (finish.error) throw new Error("website_c_result_pending");
}

/** Accepted messages survive a failed wake-up; maintenance reconciles the same IDs. */
export function wakeWebsiteTurn(company: string, message: string) {
  after(async () => {
    try {
      await processWebsiteTurn(company, message);
    } catch {
      console.warn("website_c_wakeup_pending", { company });
    }
  });
}
export async function catchUpWebsiteC(company: string) {
  const pending = await database().rpc("sv_web_chat_c_pending", {
    p_company: company,
  });
  if (pending.error) throw new Error("website_c_queue_pending");
  // Two calls at a time; each call retains its durable admission and 35s deadline.
  const ids = z.array(z.uuid()).max(4).parse(pending.data);
  for (let at = 0; at < ids.length; at += 2) {
    const work = await Promise.allSettled(
      ids.slice(at, at + 2).map((id) => processWebsiteTurn(company, id)),
    );
    if (work.some((r) => r.status === "rejected"))
      throw new Error("website_c_reconciliation_pending");
  }
}
