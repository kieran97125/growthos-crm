import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { loadCompany } from "@/lib/saas/server";
import { AccessError } from "@/lib/saas/identity";
import type { AssistantInput } from "@/lib/demo/ai-contract";
import {
  approvedKnowledge,
  companyAIRequest,
  hongKongDay,
  retrieveKnowledge,
} from "./protocol";
import { generateCompanyAnswer } from "./generate";
import { aiErrors, classifyAIError, type AIErrorCode } from "./errors";
export class AIServiceError extends AccessError {
  constructor(
    public code: string,
    message: string,
    status = 503,
  ) {
    super(message, status);
  }
}
export function aiModel() {
  const model = process.env.AI_GATEWAY_MODEL;
  return model && /^[a-z0-9-]+\/[a-zA-Z0-9._:-]+$/.test(model) ? model : null;
}
function dbError(error: { message?: string } | null) {
  if (!error) return;
  const m = error.message ?? "";
  if (
    /ai_(access_denied|product_required|brand_scope|conversation_scope)/.test(m)
  )
    throw new AccessError("你無權使用呢個公司或品牌嘅 AI。", 403);
  if (/ai_daily_limit/.test(m))
    throw new AccessError("今日 AI 用量已達上限，香港時間午夜後會重設。", 429);
  if (/ai_busy/.test(m))
    throw new AccessError("上一個 AI 請求仲處理緊，請先等候結果。", 409);
  if (/ai_disabled/.test(m))
    throw new AccessError("公司 AI 尚未啟用，請由公司擁有人開啟。", 409);
  if (/ai_(context_changed|idempotency_conflict)/.test(m))
    throw new AccessError(
      "對話或知識已更新，請重新讀取，再為最新資料生成建議。",
      409,
    );
  throw new AccessError("暫時未能確認 AI 工作記錄，請稍後核對結果。", 503);
}
function savedResult(row: {
  status: string;
  result: unknown;
  error_code?: string | null;
}) {
  if (row.status === "completed" && row.result) return row.result;
  if (row.status === "running") return { state: "running" };
  if (row.error_code === "context_changed")
    throw new AccessError(
      "生成期間資料有更新，建議未有套用。請讀取最新資料後重新生成。",
      409,
    );
  if (row.error_code === "disabled")
    throw new AccessError("公司擁有人已暫停 AI，建議未有套用。", 409);
  throw new AIServiceError(
    row.error_code ?? "unavailable",
    aiErrors[row.error_code as AIErrorCode] ?? aiErrors.unavailable,
  );
}
export async function companyAIStatus(companyId: string) {
  z.uuid().parse(companyId);
  const a = await loadCompany(companyId, "crm"),
    model = aiModel();
  const start = hongKongDay(Date.now()) + "T00:00:00+08:00";
  const [settings, runtime, usage] = await Promise.all([
    a.db
      .from("sv_ai_settings")
      .select("enabled,daily_limit")
      .eq("company_id", companyId)
      .maybeSingle(),
    a.db
      .from("sv_ai_runtime")
      .select("model,status,error_code,checked_at")
      .eq("id", "platform")
      .maybeSingle(),
    a.db
      .from("sv_ai_requests")
      .select("request_id", { head: true, count: "exact" })
      .eq("company_id", companyId)
      .gte("created_at", start),
  ]);
  for (const result of [settings, runtime, usage]) dbError(result.error);
  const brands = a.scope.brands.map((b) => ({
    ...b,
    knowledgeCount: approvedKnowledge(
      a.state.studio.articles,
      companyId,
      b.id,
      Date.now(),
    ).length,
  }));
  const enabled = settings.data?.enabled ?? false,
    limit = settings.data?.daily_limit ?? 30;
  const verified =
    runtime.data?.model === model && runtime.data?.status === "ready";
  const status = !model
    ? "unconfigured"
    : !enabled
      ? "disabled"
      : !brands.some((b) => b.knowledgeCount)
        ? "knowledge_required"
        : verified
          ? "ready"
          : runtime.data?.model === model && runtime.data?.status === "blocked"
            ? "blocked"
            : "unverified";
  return {
    companyName: a.company.name,
    model,
    status,
    enabled,
    canGenerate: a.actor.role !== "viewer",
    canConfigure: a.actor.role === "owner",
    brands,
    usage: {
      used: usage.count ?? 0,
      limit,
      resetsAt: hongKongDay(Date.now() + 86400000) + "T00:00:00+08:00",
    },
    knowledge: a.state.studio.articles.map(
      ({ id, brandId, title, status, revision, validUntil, source }) => ({
        id,
        brandId,
        title,
        status,
        revision,
        validUntil,
        source,
      }),
    ),
    checkedAt: verified ? runtime.data?.checked_at : null,
    blocker: !model
      ? "營運方尚未設定 AI 模型。"
      : !enabled
        ? "公司擁有人可以啟用 AI 助手。"
        : !brands.some((b) => b.knowledgeCount)
          ? "請先加入並核准品牌知識。"
          : status === "blocked"
            ? (aiErrors[runtime.data?.error_code as AIErrorCode] ??
              aiErrors.unavailable)
            : status === "unverified"
              ? "模型已設定，等待真實生成驗證。"
              : null,
  };
}
export async function configureCompanyAI(companyId: string, enabled: boolean) {
  const a = await loadCompany(companyId, "crm");
  if (a.actor.role !== "owner")
    throw new AccessError("只有公司擁有人可以啟用或暫停 AI。", 403);
  const r = await a.db.rpc("sv_ai_configure", {
    p_company: companyId,
    p_actor: a.user.id,
    p_enabled: enabled,
  });
  dbError(r.error);
  return { saved: true };
}
export async function prepareCompanyAnswer(raw: unknown) {
  const envelope = z.object({ companyId: z.uuid() }).safeParse(raw);
  if (!envelope.success) throw new AccessError("請先登入公司工作空間。", 401);
  const a = await loadCompany(envelope.data.companyId, "crm");
  const request = companyAIRequest.parse(raw);
  if (a.actor.role === "viewer")
    throw new AccessError("你目前只有檢視權限。", 403);
  const model = aiModel();
  if (!model) throw new AccessError("AI 模型尚未設定。", 503);
  const profile = a.state.studio.bots.find(
    (b) => b.brandId === request.brandId,
  );
  if (!profile || !a.scope.brands.some((b) => b.id === request.brandId))
    throw new AccessError("品牌 AI 設定不存在。", 403);
  let message = "",
    name = "客戶",
    sourceId: string | null = null,
    sourceRevision: number | null = null;
  let history: AssistantInput["history"] = [];
  if (request.source === "playground") message = request.message;
  else if (request.source === "conversation") {
    sourceId = request.conversationId;
    const conversation = a.state.inbox.conversations.find(
      (c) => c.id === sourceId && c.brandId === request.brandId,
    );
    if (!conversation) throw new AccessError("找不到此品牌對話。", 404);
    name =
      a.state.inbox.contacts.find((c) => c.id === conversation.contactId)
        ?.name ?? name;
    const messages = a.state.inbox.messages
      .filter(
        (m) =>
          m.conversationId === sourceId &&
          (m.kind === "incoming" || m.kind === "outgoing"),
      )
      .sort((x, y) => x.at - y.at);
    const index = messages.findLastIndex((m) => m.kind === "incoming");
    if (index < 0) throw new AccessError("未有客戶來訊可供準備回覆。", 409);
    message = messages[index].body;
    history = messages.slice(Math.max(0, index - 6), index).map((m) => ({
      role: m.kind === "incoming" ? "user" : "assistant",
      content: m.body.slice(0, 1200),
    }));
  } else if (request.source === "whatsapp") {
    sourceId = request.threadId;
    const t = await a.db
      .from("sv_wa_conversations")
      .select("id,brand_id,revision,customer_name")
      .eq("company_id", request.companyId)
      .eq("id", sourceId)
      .maybeSingle();
    dbError(t.error);
    if (!t.data || t.data.brand_id !== request.brandId)
      throw new AccessError("找不到此品牌對話。", 404);
    const m = await a.db
      .from("sv_wa_messages")
      .select("direction,body,seq")
      .eq("company_id", request.companyId)
      .eq("conversation_id", sourceId)
      .in("direction", ["incoming", "outgoing"])
      .in("state", ["accepted", "sent", "delivered", "read"])
      .order("seq", { ascending: false })
      .limit(20);
    dbError(m.error);
    const messages = (m.data ?? []).reverse(),
      index = messages.findLastIndex((m) => m.direction === "incoming");
    if (index < 0) throw new AccessError("未有客戶來訊可供準備回覆。", 409);
    message = messages[index].body;
    name = t.data.customer_name || name;
    sourceRevision = t.data.revision;
    history = messages.slice(Math.max(0, index - 6), index).map((m) => ({
      role: m.direction === "incoming" ? "user" : "assistant",
      content: m.body.slice(0, 1200),
    }));
  } else {
    sourceId = request.threadId;
    const t = await a.db
      .from("sv_meta_threads")
      .select("id,revision,connection_id,customer_name")
      .eq("company_id", request.companyId)
      .eq("id", sourceId)
      .maybeSingle();
    dbError(t.error);
    if (!t.data) throw new AccessError("找不到此公司對話。", 404);
    const c = await a.db
      .from("sv_meta_connections")
      .select("brand_id")
      .eq("company_id", request.companyId)
      .eq("id", t.data.connection_id)
      .single();
    dbError(c.error);
    if (c.data?.brand_id !== request.brandId)
      throw new AccessError("對話不屬於此品牌。", 403);
    const m = await a.db
      .from("sv_meta_messages")
      .select("direction,body,seq")
      .eq("company_id", request.companyId)
      .eq("thread_id", sourceId)
      .in("direction", ["inbound", "outbound"])
      .in("state", ["received", "accepted", "sent", "delivered", "read"])
      .order("seq", { ascending: false })
      .limit(20);
    dbError(m.error);
    const messages = (m.data ?? []).reverse(),
      index = messages.findLastIndex((m) => m.direction === "inbound");
    if (index < 0) throw new AccessError("未有客戶來訊可供準備回覆。", 409);
    message = messages[index].body;
    name = t.data.customer_name || name;
    sourceRevision = t.data.revision;
    history = messages.slice(Math.max(0, index - 6), index).map((m) => ({
      role: m.direction === "inbound" ? "user" : "assistant",
      content: m.body.slice(0, 1200),
    }));
  }
  if (message.length > 2000)
    throw new AccessError(
      "客戶訊息較長，請先在 AI 工作室整理需要核對嘅重點。",
      400,
    );
  const now = Date.now(),
    articles = retrieveKnowledge(
      approvedKnowledge(
        a.state.studio.articles,
        request.companyId,
        request.brandId,
        now,
      ),
      message,
    );
  if (!articles.length)
    throw new AccessError(
      "此品牌未有有效嘅核准知識。請先管理知識庫，再生成建議。",
      409,
    );
  const input: AssistantInput = {
    message,
    name,
    brandId: request.brandId,
    profile,
    articles,
    history,
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
        revision: a.revision,
        sourceRevision,
        model,
      }),
    )
    .digest("hex");
  const claim = await a.db.rpc("sv_ai_claim", {
    p_company: request.companyId,
    p_actor: a.user.id,
    p_request: request.requestId,
    p_brand: request.brandId,
    p_source: request.source,
    p_source_id: sourceId,
    p_workspace_revision: a.revision,
    p_source_revision: sourceRevision,
    p_model: model,
    p_hash: hash,
  });
  dbError(claim.error);
  if (!claim.data.dispatch) return savedResult(claim.data);
  let answer: unknown = null,
    errorCode: string | null = null,
    inputTokens: number | null = null,
    outputTokens: number | null = null;
  try {
    const result = await generateCompanyAnswer(
      input,
      model,
      a.company.name,
      now,
      request.goal,
    );
    answer = {
      ...result.answer,
      requestId: request.requestId,
      goal: request.goal,
    };
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;
  } catch (e) {
    errorCode = classifyAIError(e);
  }
  const completed = await a.db.rpc("sv_ai_finish", {
    p_company: request.companyId,
    p_actor: a.user.id,
    p_request: request.requestId,
    p_result: answer,
    p_error: errorCode,
    p_input: inputTokens,
    p_output: outputTokens,
  });
  dbError(completed.error);
  // A successful real request also confirms readiness after an operator tops
  // up credits; no redeploy or public diagnostic endpoint is needed.
  if (
    !errorCode ||
    [
      "verification_required",
      "credits_required",
      "paid_credits_required",
      "authentication",
      "budget_exhausted",
    ].includes(errorCode)
  ) {
    const health = await a.db.from("sv_ai_runtime").upsert({
      id: "platform",
      model,
      status: errorCode ? "blocked" : "ready",
      error_code: errorCode,
      checked_at: new Date().toISOString(),
    });
    if (health.error) console.error("company_ai_health_write_failed");
  }
  return savedResult(completed.data);
}
