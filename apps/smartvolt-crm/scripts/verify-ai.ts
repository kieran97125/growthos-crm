// Explicit deployment smoke test. Not part of the normal build/CI command.
// Only public synthetic text is sent. No customer data or credentials are logged.
import { generateText, Output } from "ai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { classifyAIError } from "../src/lib/ai/errors";

async function main() {
  const model = process.env.AI_GATEWAY_MODEL ?? "openai/gpt-5.4-mini";
  const checked_at = new Date().toISOString();
  let status: "ready" | "blocked" = "blocked",
    code: string | null = null;
  try {
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
        reply: result.output.reply,
        inputTokens: result.totalUsage.inputTokens,
        outputTokens: result.totalUsage.outputTokens,
      }),
    );
  } catch (e) {
    code = classifyAIError(e);
    console.log(
      "CONVELTA_AI_PROBE",
      JSON.stringify({ ok: false, model, checked_at, code }),
    );
  }
  const url = process.env.SMARTVOLT_SUPABASE_URL,
    secret = process.env.SMARTVOLT_SUPABASE_SECRET_KEY;
  if (url && secret) {
    const db = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
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
