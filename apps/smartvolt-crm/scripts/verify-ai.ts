// Explicit deployment smoke test. Not part of the normal build/CI command.
// Only public synthetic text is sent. No customer data or credentials are logged.
import { generateText, Output } from "ai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { classifyAIError } from "../src/lib/ai/errors";
import { createHash, randomUUID } from "node:crypto";
import { appSchema } from "../src/lib/demo/state";
import { approvedKnowledge, retrieveKnowledge } from "../src/lib/ai/protocol";
import { generateCompanyAnswer } from "../src/lib/ai/generate";
import type { AssistantInput } from "../src/lib/demo/ai-contract";

async function main() {
  const model = process.env.AI_GATEWAY_MODEL ?? "openai/gpt-5.4-mini";
  const checked_at = new Date().toISOString();
  let status: "ready" | "blocked" = "blocked",
    code: string | null = null;
  const url = process.env.SMARTVOLT_SUPABASE_URL,
    secret = process.env.SMARTVOLT_SUPABASE_SECRET_KEY;
  const db =
    url && secret
      ? createClient(url, secret, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;
  const target = process.env.SMARTVOLT_AI_VERIFICATION_COMPANY_ID;
  let receipt: { company: string; actor: string; request: string } | null =
    null;
  try {
    if (db && target) {
      z.uuid().parse(target);
      const workspace = await db
        .from("sv_workspaces")
        .select("revision,payload")
        .eq("company_id", target)
        .single();
      const owner = await db
        .from("sv_memberships")
        .select("user_id")
        .eq("company_id", target)
        .eq("role", "owner")
        .eq("status", "active")
        .limit(1)
        .single();
      if (workspace.error || owner.error)
        throw new Error("AI acceptance workspace is unavailable.");
      const state = appSchema.parse(workspace.data.payload);
      if (state.scope?.companyId !== target)
        throw new Error("AI acceptance company scope mismatch.");
      const brand = state.scope.brands[0],
        profile = state.studio.bots.find((b) => b.brandId === brand.id);
      if (!profile)
        throw new Error("AI acceptance brand configuration is unavailable.");
      const message =
        "我有幾位同事覆 IG 同 Facebook，想集中整理客戶查詢。Convelta 可以點幫手？";
      const articles = retrieveKnowledge(
        approvedKnowledge(state.studio.articles, target, brand.id, Date.now()),
        message,
      );
      if (!articles.length)
        throw new Error("AI acceptance requires approved knowledge.");
      const request = {
        companyId: target,
        requestId: randomUUID(),
        brandId: brand.id,
        source: "playground",
        message,
      };
      const input: AssistantInput = {
        message,
        name: "客戶",
        brandId: brand.id,
        profile,
        articles,
        history: [],
        assist: true,
        withinWindow: false,
        humanOwned: true,
        businessHours: true,
      };
      const hash = createHash("sha256")
        .update(
          JSON.stringify({
            request,
            input,
            revision: workspace.data.revision,
            sourceRevision: null,
            model,
          }),
        )
        .digest("hex");
      const claim = await db.rpc("sv_ai_claim", {
        p_company: target,
        p_actor: owner.data.user_id,
        p_request: request.requestId,
        p_brand: brand.id,
        p_source: "playground",
        p_source_id: null,
        p_workspace_revision: workspace.data.revision,
        p_source_revision: null,
        p_model: model,
        p_hash: hash,
      });
      if (claim.error || !claim.data?.dispatch)
        throw new Error("AI acceptance claim was not admitted.");
      receipt = {
        company: target,
        actor: owner.data.user_id,
        request: request.requestId,
      };
      const generated = await generateCompanyAnswer(
        input,
        model,
        state.scope.companyName,
        Date.now(),
      );
      if (
        generated.answer.decision !== "draft" ||
        !generated.answer.sources.length
      )
        throw new Error("AI acceptance evidence validation did not pass.");
      const saved = await db.rpc("sv_ai_finish", {
        p_company: target,
        p_actor: owner.data.user_id,
        p_request: request.requestId,
        p_result: { ...generated.answer, requestId: request.requestId },
        p_error: null,
        p_input: generated.inputTokens,
        p_output: generated.outputTokens,
      });
      if (saved.error || saved.data?.status !== "completed")
        throw new Error("AI acceptance receipt was not confirmed.");
      status = "ready";
      console.log(
        "CONVELTA_AI_PROBE",
        JSON.stringify({
          ok: true,
          model,
          checked_at,
          mode: "company-grounded-playground",
          reply: generated.answer.reply,
          sources: generated.answer.sources.map((s) => ({
            title: s.title,
            revision: s.revision,
          })),
          inputTokens: generated.inputTokens,
          outputTokens: generated.outputTokens,
        }),
      );
    } else {
      const result = await generateText({
        model,
        output: Output.object({
          schema: z.object({ reply: z.string().min(1).max(500) }),
        }),
        prompt:
          "你係 Convelta 嘅廣東話客服助手。客人想了解點集中處理 Messenger 同 Instagram 查詢。用一句繁體廣東話邀請佢講下使用需要，唔好承諾價錢或已接通渠道。",
        reasoning: "none",
        maxOutputTokens: 400,
        maxRetries: 0,
        timeout: 20000,
        providerOptions: { gateway: { only: ["openai", "azure"] } },
      });
      status = "ready";
      console.log(
        "CONVELTA_AI_PROBE",
        JSON.stringify({
          ok: true,
          model,
          checked_at,
          mode: "platform-connection",
          reply: result.output.reply,
          inputTokens: result.totalUsage.inputTokens,
          outputTokens: result.totalUsage.outputTokens,
        }),
      );
    }
  } catch (e) {
    code = classifyAIError(e);
    if (db && receipt)
      await db.rpc("sv_ai_finish", {
        p_company: receipt.company,
        p_actor: receipt.actor,
        p_request: receipt.request,
        p_result: null,
        p_error: code,
        p_input: null,
        p_output: null,
      });
    const diagnostic: { name?: string; status?: unknown; reason?: string }[] =
      [];
    let cause: unknown = e;
    for (let i = 0; cause && typeof cause === "object" && i < 4; i++) {
      const item = cause as Record<string, unknown>;
      const reason =
        typeof item.message === "string"
          ? item.message
              .replace(/Bearer\s+\S+/gi, "[redacted]")
              .replace(/https?:\/\/[^\s)]+/g, "[url]")
              .replace(/[A-Za-z0-9_-]{20,}(?:\.[A-Za-z0-9_-]+)*/g, "[redacted]")
              .slice(0, 500)
          : undefined;
      diagnostic.push({
        name: typeof item.name === "string" ? item.name : undefined,
        status: item.statusCode,
        reason,
      });
      cause = item.cause;
    }
    console.log(
      "CONVELTA_AI_PROBE",
      JSON.stringify({ ok: false, model, checked_at, code, diagnostic }),
    );
  }
  if (db) {
    const saved = await db
      .from("sv_ai_runtime")
      .upsert({ id: "platform", model, status, error_code: code, checked_at });
    if (saved.error)
      throw new Error("AI verification status could not be persisted.");
  }
}
void main().catch(() => {
  console.error("AI verification state could not be saved.");
  process.exitCode = 1;
});
