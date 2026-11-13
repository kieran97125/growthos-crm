import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { requireCompany } from "@/lib/saas/server";
import { requireProduct } from "@/lib/saas/products";
import { AccessError } from "@/lib/saas/identity";
import { aiModel } from "@/lib/ai/server";
import { aiErrors, classifyAIError } from "@/lib/ai/errors";
import { generateTranslation } from "./generate";
import {
  protectTranslationText,
  restoreTranslationText,
  translationRequest,
  translationResult,
} from "./model";

export class TranslationError extends AccessError {
  constructor(
    public code: string,
    message: string,
    status = 503,
  ) {
    super(message, status);
  }
}
function dbError(error: { message?: string } | null) {
  if (!error) return;
  const m = error.message ?? "";
  if (
    /ai_(access_denied|product_required|brand_scope|conversation_scope)/.test(m)
  )
    throw new TranslationError(
      "access_denied",
      "你無權翻譯此公司或品牌嘅對話。",
      403,
    );
  if (/ai_daily_limit/.test(m))
    throw new TranslationError(
      "daily_limit",
      "今日 AI 用量已達上限，香港時間午夜後會重設。",
      429,
    );
  if (/ai_busy/.test(m))
    throw new TranslationError(
      "busy",
      "上一個 AI 請求仍在處理，請稍後再試。",
      409,
    );
  if (/ai_disabled/.test(m))
    throw new TranslationError(
      "disabled",
      "公司 AI 尚未啟用，請由公司擁有人開啟。",
      409,
    );
  if (/translation_source/.test(m))
    throw new TranslationError(
      "source_unavailable",
      "呢則訊息未有可翻譯文字，或已不屬於此對話。",
      409,
    );
  if (/ai_idempotency_conflict/.test(m))
    throw new TranslationError(
      "conflict",
      "翻譯請求資料不一致，請重新讀取對話。",
      409,
    );
  throw new AccessError("暫時未能核對翻譯記錄，請用同一操作再試。", 503);
}
function saved(row: { status: string; result?: unknown; error_code?: string }) {
  if (row.status === "completed") return translationResult.parse(row.result);
  if (row.status === "running") return { state: "running" as const };
  if (row.error_code === "disabled")
    throw new TranslationError(
      "disabled",
      "公司 AI 已暫停，未有套用譯文。",
      409,
    );
  if (row.error_code === "source_changed")
    throw new TranslationError(
      "source_changed",
      "原文已更新，請重新讀取對話再翻譯。",
      409,
    );
  if (row.error_code === "translation_verification_failed")
    throw new TranslationError(
      "translation_verification_failed",
      "譯文未能完整保留原文數字或連結，請再試。原文仍然保留。",
      422,
    );
  throw new TranslationError(
    row.error_code ?? "unavailable",
    aiErrors[row.error_code as keyof typeof aiErrors] ??
      "翻譯暫時未完成，請再試。原文仍然保留。",
  );
}
export async function translateCompanyText(raw: unknown) {
  const request = translationRequest.parse(raw);
  const a = await requireCompany(request.companyId);
  requireProduct(a.products, "crm");
  if (a.actor.role === "viewer")
    throw new AccessError("你目前只有檢視權限。", 403);
  const model = aiModel();
  if (!model)
    throw new TranslationError(
      "unconfigured",
      "翻譯服務尚未設定，請由營運方啟用。",
      503,
    );
  const { companyId, requestId, ...data } = request;
  const hash = createHash("sha256")
    .update(JSON.stringify({ feature: "translation-v1", ...data }))
    .digest("hex");
  const claim = await a.db.rpc("sv_translation_claim", {
    p_company: companyId,
    p_actor: a.user.id,
    p_request: requestId,
    p_data: data,
    p_model: model,
    p_hash: hash,
  });
  dbError(claim.error);
  if (!claim.data.dispatch) return saved(claim.data);
  let result = null,
    code: string | null = null,
    input: number | null = null,
    output: number | null = null;
  try {
    const source = protectTranslationText(
      claim.data.sourceText,
      randomBytes(6).toString("hex"),
    );
    const generated = await generateTranslation(
      source.masked,
      request.target,
      model,
    );
    input = generated.inputTokens;
    output = generated.outputTokens;
    result = {
      requestId,
      target: request.target,
      text: restoreTranslationText(generated.text, source),
    };
  } catch (error) {
    code =
      error instanceof Error &&
      error.message === "translation_verification_failed"
        ? error.message
        : classifyAIError(error);
  }
  const finish = await a.db.rpc("sv_translation_finish", {
    p_company: companyId,
    p_actor: a.user.id,
    p_request: requestId,
    p_result: result,
    p_error: code,
    p_input: input,
    p_output: output,
  });
  dbError(finish.error);
  return saved(finish.data);
}
