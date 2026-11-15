import "server-only";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { loadCompany } from "@/lib/saas/server";
import { AccessError, canManage } from "@/lib/saas/identity";
import { requireThreadScope } from "@/lib/saas/scope-server";
import { aiModel } from "@/lib/ai/server";
import { aiErrors, classifyAIError, type AIErrorCode } from "@/lib/ai/errors";
import { approvedKnowledge, retrieveKnowledge } from "@/lib/ai/protocol";
import { generateCoaching } from "./generate";
import { validateAdoption } from "./protocol";
import {
  commandSchema,
  querySchema,
  outputSchema,
  type CoachingAnalysis,
  type CoachingContext,
  type CoachingPage,
  type CoachingSource,
  type CoachingMessage,
  type CoachingReview,
  type LearningRecord,
} from "./model";

type Access = Awaited<ReturnType<typeof loadCompany>>;
type StoredAnalysis = {
  id: string;
  brand_id: string;
  source: CoachingSource;
  source_id: string;
  source_stamp: string;
  result: CoachingAnalysis;
  created_at: string;
};
type StoredReview = {
  command_id: string;
  analysis_id: string;
  actor_id: string;
  kind: string;
  data: Record<string, unknown>;
  result: { articleId?: string };
  created_at: string;
};
function checked(error: { message?: string; code?: string } | null) {
  if (!error) return;
  const m = error.message ?? "";
  if (
    /access_denied|product_required|brand_scope|member_scope|product_not_purchased/.test(
      m,
    )
  )
    throw new AccessError("你無權使用此公司或品牌嘅客服教練。", 403);
  if (/daily_limit/.test(m))
    throw new AccessError("今日 AI 用量已達上限，香港時間午夜後會重設。", 429);
  if (/ai_busy/.test(m))
    throw new AccessError("上一個 AI 請求仲處理緊，請等候結果。", 409);
  if (/ai_disabled/.test(m))
    throw new AccessError("公司 AI 尚未啟用，請由公司擁有人開啟。", 409);
  if (
    /context_changed|source_changed|revision|idempotency|already_adopted/.test(
      m,
    ) ||
    error.code === "23505"
  )
    throw new AccessError(
      "對話、知識或操作記錄已更新，請重新讀取後核對。",
      409,
    );
  if (
    error.code === "P0002" ||
    /source_missing|analysis_missing|conversation_scope/.test(m)
  )
    throw new AccessError("找不到此品牌對話或分析記錄。", 404);
  if (/invalid|not_publishable/.test(m))
    throw new AccessError("資料未通過核對，改動未有儲存。", 400);
  throw new AccessError("暫時未能完成客服教練操作，請稍後核對同一請求。", 503);
}
function brand(a: Access, id: string) {
  if (!a.scope.brands.some((b) => b.id === id))
    throw new AccessError("你無權使用此品牌。", 403);
}
async function context(
  a: Access,
  brandId: string,
  source: CoachingSource,
  sourceId: string,
): Promise<CoachingContext> {
  brand(a, brandId);
  if (source !== "conversation" && !z.uuid().safeParse(sourceId).success)
    throw new AccessError("對話識別無效。", 400);
  const r = await a.db.rpc("sv_coaching_context", {
    p_company: a.company.id,
    p_actor: a.user.id,
    p_brand: brandId,
    p_source: source,
    p_source_id: sourceId,
  });
  checked(r.error);
  return z
    .object({
      stamp: z.string().regex(/^[a-f0-9]{32}$/),
      workspaceRevision: z.number().int().nonnegative(),
      sourceRevision: z.number().int().nonnegative().nullable(),
      verifiedBooking: z.boolean(),
      label: z.string(),
    })
    .parse(r.data);
}
async function sourceInput(
  a: Access,
  brandId: string,
  source: CoachingSource,
  sourceId: string,
) {
  const before = await context(a, brandId, source, sourceId);
  if (a.revision !== before.workspaceRevision)
    throw new AccessError("工作空間已更新，請重新讀取後再分析。", 409);
  let messages: CoachingMessage[] = [],
    truncated = false,
    privateNames: string[] = [];
  if (source === "conversation") {
    const c = a.state.inbox.conversations.find(
      (c) => c.id === sourceId && c.brandId === brandId,
    );
    if (!c) throw new AccessError("找不到此品牌對話。", 404);
    privateNames = [
      a.state.inbox.contacts.find((x) => x.id === c.contactId)?.name ?? "",
    ];
    messages = a.state.inbox.messages
      .filter(
        (m) =>
          m.conversationId === sourceId &&
          (m.kind === "incoming" || m.kind === "outgoing"),
      )
      .sort((x, y) => x.at - y.at)
      .map((m) => ({
        id: m.id,
        direction: m.kind as "incoming" | "outgoing",
        body: m.body,
        at: m.at,
      }));
  } else {
    await requireThreadScope(a, source, sourceId);
    const thread = await a.db
      .from(source === "meta" ? "sv_meta_threads" : "sv_wa_conversations")
      .select("customer_name")
      .eq("company_id", a.company.id)
      .eq("id", sourceId)
      .maybeSingle();
    checked(thread.error);
    privateNames = [thread.data?.customer_name ?? ""];
    if (source === "meta") {
      const r = await a.db
        .from("sv_meta_messages")
        .select("id,direction,body,provider_at,created_at", { count: "exact" })
        .eq("company_id", a.company.id)
        .eq("thread_id", sourceId)
        .in("direction", ["inbound", "outbound"])
        .in("state", ["received", "accepted", "sent", "delivered", "read"])
        .order("seq", { ascending: false })
        .limit(41);
      checked(r.error);
      truncated = (r.count ?? 0) > 40;
      messages = (r.data ?? [])
        .reverse()
        .filter((m) => m.body !== "[附件／分享內容：請於原生平台查看]")
        .map((m) => ({
          id: m.id,
          direction: m.direction === "inbound" ? "incoming" : "outgoing",
          body: m.body,
          at: m.provider_at ?? Date.parse(m.created_at),
        }));
    } else {
      const r = await a.db
        .from("sv_wa_messages")
        .select("id,direction,body,provider_at", { count: "exact" })
        .eq("company_id", a.company.id)
        .eq("conversation_id", sourceId)
        .eq("message_type", "text")
        .in("direction", ["incoming", "outgoing"])
        .in("state", ["accepted", "sent", "delivered", "read"])
        .order("seq", { ascending: false })
        .limit(41);
      checked(r.error);
      truncated = (r.count ?? 0) > 40;
      messages = (r.data ?? [])
        .reverse()
        .map((m) => ({
          id: m.id,
          direction: m.direction as "incoming" | "outgoing",
          body: m.body,
          at: m.provider_at,
        }));
    }
  }
  truncated ||=
    messages.length > 40 || messages.some((m) => m.body.length > 1600);
  let chars = 0;
  const bounded: CoachingMessage[] = [];
  for (const m of messages.slice(-40).reverse()) {
    const body = m.body.slice(0, 1600);
    if (chars + body.length > 18000) {
      truncated = true;
      break;
    }
    chars += body.length;
    bounded.unshift({ ...m, body });
  }
  const after = await context(a, brandId, source, sourceId);
  if (
    before.stamp !== after.stamp ||
    before.workspaceRevision !== after.workspaceRevision
  )
    throw new AccessError("讀取期間對話有更新，請重新分析。", 409);
  return {
    context: after,
    messages: bounded,
    truncated,
    privateNames: [
      ...privateNames,
      ...a.scope.team.map((t) => t.name),
      a.actor.name,
    ],
  };
}
function result(row: {
  status: string;
  result?: unknown;
  error_code?: string;
}): { state: "running" } | { analysis: CoachingAnalysis } {
  if (row.status === "running") return { state: "running" as const };
  if (row.status === "completed" && row.result)
    return { analysis: row.result as CoachingAnalysis };
  if (
    ["context_changed", "source_changed", "interrupted", "disabled"].includes(
      row.error_code ?? "",
    )
  )
    throw new AccessError(
      "分析期間資料或設定有變，未有套用；請重新讀取後再分析。",
      409,
    );
  throw new AccessError(
    aiErrors[row.error_code as AIErrorCode] ?? aiErrors.unavailable,
    503,
  );
}
function knowledgeFresh(a: Access, analysis: CoachingAnalysis) {
  const current = approvedKnowledge(
    a.state.studio.articles,
    a.company.id,
    analysis.brandId,
    Date.now(),
  );
  return (analysis.knowledgeRefs ?? []).every((ref) =>
    current.some(
      (article) =>
        article.id === ref.id &&
        article.revision === ref.revision &&
        article.validUntil === ref.validUntil &&
        createHash("sha256").update(article.content).digest("hex") ===
          ref.contentHash,
    ),
  );
}
async function sources(a: Access, brandId: string) {
  const [wa, meta] = await Promise.all([
    a.db
      .from("sv_wa_conversations")
      .select("id,customer_name")
      .eq("company_id", a.company.id)
      .eq("brand_id", brandId)
      .order("updated_at", { ascending: false })
      .limit(20),
    a.db
      .from("sv_meta_threads")
      .select("id,customer_name,sv_meta_connections!inner(brand_id)")
      .eq("company_id", a.company.id)
      .eq("sv_meta_connections.brand_id", brandId)
      .order("updated_at", { ascending: false })
      .limit(20),
  ]);
  checked(wa.error);
  checked(meta.error);
  return [
    ...a.state.inbox.conversations
      .filter((c) => c.brandId === brandId)
      .slice(-20)
      .reverse()
      .map((c) => ({
        source: "conversation" as const,
        sourceId: c.id,
        brandId,
        label:
          a.state.inbox.contacts.find((x) => x.id === c.contactId)?.name ||
          "客戶對話",
        preview: "已儲存對話",
      })),
    ...(wa.data ?? []).map((t) => ({
      source: "whatsapp" as const,
      sourceId: t.id,
      brandId,
      label: t.customer_name || "WhatsApp 客戶",
      preview: "WhatsApp",
    })),
    ...(meta.data ?? []).map((t) => ({
      source: "meta" as const,
      sourceId: t.id,
      brandId,
      label: t.customer_name || "社交渠道客戶",
      preview: "Messenger／Instagram",
    })),
  ].slice(0, 50);
}
async function rowsFor(
  a: Access,
  brandId: string,
  source?: CoachingSource,
  sourceId?: string,
) {
  let q = a.db
    .from("sv_coaching_analyses")
    .select("id,brand_id,source,source_id,source_stamp,result,created_at")
    .eq("company_id", a.company.id)
    .eq("brand_id", brandId);
  if (source && sourceId) q = q.eq("source", source).eq("source_id", sourceId);
  const r = await q.order("created_at", { ascending: false }).limit(30);
  checked(r.error);
  return (r.data ?? []) as StoredAnalysis[];
}
export async function readCoaching(
  companyId: string,
  raw: unknown,
): Promise<CoachingPage> {
  z.uuid().parse(companyId);
  const a = await loadCompany(companyId, "crm"),
    q = querySchema.parse(raw);
  brand(a, q.brandId);
  const contextCache = new Map<string, Promise<CoachingContext>>();
  const currentContext = (
    brandId: string,
    source: CoachingSource,
    sourceId: string,
  ) => {
    const key = JSON.stringify([brandId, source, sourceId]);
    if (!contextCache.has(key))
      contextCache.set(key, context(a, brandId, source, sourceId));
    return contextCache.get(key)!;
  };
  if (q.source && q.sourceId)
    await currentContext(q.brandId, q.source, q.sourceId);
  const [stored, options] = await Promise.all([
    rowsFor(a, q.brandId, q.source, q.sourceId),
    q.source ? Promise.resolve([]) : sources(a, q.brandId),
  ]);
  const reviewQuery = (kind: string, limit: number) =>
    a.db
      .from("sv_coaching_reviews")
      .select("command_id,analysis_id,actor_id,kind,data,result,created_at")
      .eq("company_id", companyId)
      .eq("kind", kind)
      .in(
        "analysis_id",
        stored.map((r) => r.id),
      )
      .order("created_at", { ascending: false })
      .limit(limit);
  const reviewRows = stored.length
    ? await Promise.all([reviewQuery("adopt", 120), reviewQuery("review", 200)])
    : [];
  for (const row of reviewRows) checked(row.error);
  const reviews = reviewRows.flatMap((r) => r.data ?? []) as StoredReview[];
  const analyses: CoachingAnalysis[] = [];
  const project = async (row: StoredAnalysis): Promise<CoachingAnalysis> => {
    let stale = true;
    try {
      stale =
        (await currentContext(row.brand_id, row.source, row.source_id))
          .stamp !== row.source_stamp;
    } catch {
      /* Keep historical evidence visibly stale if the original source is unavailable. */
    }
    const latest = reviews.find(
      (r) => r.analysis_id === row.id && r.kind === "review",
    );
    const latestReview: CoachingReview | null = latest
      ? {
          commandId: latest.command_id,
          lossCode: latest.data.lossCode as CoachingReview["lossCode"],
          reason: String(latest.data.reason),
          dismissedFindingCodes: latest.data.dismissedFindingCodes as string[],
          actorName: "主管覆核",
          createdAt: latest.created_at,
        }
      : null;
    return {
      ...outputSchema.parse(row.result),
      id: row.id,
      brandId: row.brand_id,
      source: row.source,
      sourceId: row.source_id,
      createdAt: row.created_at,
      stale: stale || !knowledgeFresh(a, row.result),
      outcome: row.result.outcome,
      coverage: row.result.coverage,
      latestReview,
      knowledgeRefs: row.result.knowledgeRefs,
    };
  };
  for (let i = 0; i < stored.length; i += 4)
    analyses.push(...(await Promise.all(stored.slice(i, i + 4).map(project))));
  const learning: LearningRecord[] = analyses.flatMap((analysis) =>
    analysis.learning.map((item, index) => {
      const adoption = reviews.find(
        (r) =>
          r.kind === "adopt" &&
          r.analysis_id === analysis.id &&
          Number(r.data.index) === index,
      );
      return {
        analysisId: analysis.id,
        index,
        brandId: analysis.brandId,
        item,
        status: adoption ? ("adopted" as const) : ("suggested" as const),
        articleId: adoption?.result.articleId ?? null,
        createdAt: analysis.createdAt,
        stale: analysis.stale,
        verifiedBooking: analysis.outcome.verifiedBooking,
      };
    }),
  );
  return {
    analyses,
    learning,
    sources: options,
    canGenerate: a.actor.role !== "viewer",
    canManage: canManage(a.actor.role),
  };
}
export async function actCoaching(companyId: string, raw: unknown) {
  z.uuid().parse(companyId);
  const a = await loadCompany(companyId, "crm"),
    cmd = commandSchema.parse(raw);
  if (cmd.type === "analyze") {
    brand(a, cmd.brandId);
    if (a.actor.role === "viewer")
      throw new AccessError("你目前只有檢視權限。", 403);
    const model = aiModel();
    if (!model) throw new AccessError("AI 模型尚未設定。", 503);
    // Replay the original command hash, even after the conversation changes.
    const hash = createHash("sha256")
      .update(JSON.stringify({ feature: "coaching-v1", ...cmd, model }))
      .digest("hex");
    const input = await sourceInput(a, cmd.brandId, cmd.source, cmd.sourceId);
    if (!input.messages.length)
      throw new AccessError("未有可分析嘅文字對話。", 409);
    const claim = await a.db.rpc("sv_coaching_claim", {
      p_company: companyId,
      p_actor: a.user.id,
      p_request: cmd.requestId,
      p_brand: cmd.brandId,
      p_source: cmd.source,
      p_source_id: cmd.sourceId,
      p_stamp: input.context.stamp,
      p_workspace_revision: input.context.workspaceRevision,
      p_model: model,
      p_hash: hash,
    });
    checked(claim.error);
    if (!claim.data.dispatch) {
      const receipt = result(claim.data);
      if ("analysis" in receipt) {
        const stored = await a.db
          .from("sv_coaching_analyses")
          .select("source_stamp")
          .eq("company_id", companyId)
          .eq("id", cmd.requestId)
          .maybeSingle();
        checked(stored.error);
        receipt.analysis = {
          ...receipt.analysis,
          stale:
            stored.data?.source_stamp !== input.context.stamp ||
            !knowledgeFresh(a, receipt.analysis),
        };
      }
      return receipt;
    }
    const now = Date.now();
    const articles = retrieveKnowledge(
      approvedKnowledge(a.state.studio.articles, companyId, cmd.brandId, now),
      input.messages.map((m) => m.body).join("\n"),
    );
    let analysis: CoachingAnalysis | null = null,
      error: string | null = null,
      inTokens: number | null = null,
      outTokens: number | null = null;
    try {
      const generated = await generateCoaching(
        model,
        input.messages,
        articles,
        input.context,
        input.truncated,
        input.privateNames,
      );
      inTokens = generated.inputTokens;
      outTokens = generated.outputTokens;
      if (!generated.output) throw new Error("coaching_invalid_evidence");
      analysis = {
        ...generated.output,
        id: cmd.requestId,
        brandId: cmd.brandId,
        source: cmd.source,
        sourceId: cmd.sourceId,
        createdAt: new Date(now).toISOString(),
        stale: false,
        outcome: {
          verifiedBooking: input.context.verifiedBooking,
          label: input.context.label,
        },
        coverage: {
          messages: input.messages.length,
          truncated: input.truncated,
          label: input.truncated
            ? "只分析最近可讀文字，較早或過長內容未完整覆蓋"
            : "已分析此對話可讀文字",
        },
        latestReview: null,
        knowledgeRefs: articles.map((article) => ({
          id: article.id,
          revision: article.revision,
          contentHash: createHash("sha256")
            .update(article.content)
            .digest("hex"),
          validUntil: article.validUntil,
        })),
      };
    } catch (e) {
      error =
        e instanceof Error && /coaching_invalid_evidence/.test(e.message)
          ? "answer_verification_failed"
          : classifyAIError(e);
    }
    const finish = await a.db.rpc("sv_coaching_finish", {
      p_company: companyId,
      p_actor: a.user.id,
      p_request: cmd.requestId,
      p_result: analysis,
      p_error: error,
      p_input: inTokens,
      p_output: outTokens,
    });
    checked(finish.error);
    return result(finish.data);
  }
  if (!canManage(a.actor.role))
    throw new AccessError("此操作需要公司管理員權限。", 403);
  const stored = await a.db
    .from("sv_coaching_analyses")
    .select("id,brand_id,source,source_id,source_stamp,result,created_at")
    .eq("company_id", companyId)
    .eq("id", cmd.analysisId)
    .maybeSingle();
  checked(stored.error);
  if (!stored.data) throw new AccessError("找不到此分析記錄。", 404);
  const row = stored.data as StoredAnalysis;
  brand(a, row.brand_id);
  const { type, commandId, ...expectedData } = cmd;
  const previous = await a.db
    .from("sv_action_receipts")
    .select("actor_id,kind,data,result")
    .eq("company_id", companyId)
    .eq("command_id", commandId)
    .maybeSingle();
  checked(previous.error);
  if (previous.data) {
    if (
      previous.data.actor_id !== a.user.id ||
      previous.data.kind !== "coaching:" + type ||
      !isDeepStrictEqual(previous.data.data, expectedData)
    )
      throw new AccessError(
        "操作識別已用於另一個動作，請重新讀取後核對。",
        409,
      );
    return previous.data.result;
  }
  if (cmd.type === "review") {
    const r = await a.db.rpc("sv_coaching_review", {
      p_company: companyId,
      p_actor: a.user.id,
      p_analysis: cmd.analysisId,
      p_command: cmd.commandId,
      p_loss_code: cmd.lossCode,
      p_reason: cmd.reason,
      p_dismissed_codes: cmd.dismissedFindingCodes,
    });
    checked(r.error);
    return r.data;
  }
  const current = await sourceInput(a, row.brand_id, row.source, row.source_id);
  if (
    current.context.stamp !== row.source_stamp ||
    !knowledgeFresh(a, row.result)
  )
    throw new AccessError(
      "來源對話、預約結果或品牌知識已更新，請重新分析後再採用。",
      409,
    );
  const item = outputSchema.parse(row.result).learning[cmd.index];
  if (!item) throw new AccessError("找不到此話術建議。", 404);
  try {
    validateAdoption(
      item,
      cmd.title,
      cmd.content,
      approvedKnowledge(
        a.state.studio.articles,
        companyId,
        row.brand_id,
        Date.now(),
      ),
      current.privateNames,
    );
  } catch {
    throw new AccessError(
      "話術仍含個人資料、未核實資料或知識缺口，請先修正或喺品牌知識庫核實。",
      409,
    );
  }
  const r = await a.db.rpc("sv_coaching_adopt", {
    p_company: companyId,
    p_actor: a.user.id,
    p_analysis: cmd.analysisId,
    p_index: cmd.index,
    p_command: cmd.commandId,
    p_title: cmd.title,
    p_content: cmd.content,
    p_valid_until: cmd.validUntil,
    p_workspace_revision: a.revision,
  });
  checked(r.error);
  return r.data;
}
