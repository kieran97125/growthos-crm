import "server-only";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { requireCompany } from "@/lib/saas/server";
import { requireProduct } from "@/lib/saas/products";
import { appSchema } from "@/lib/demo/state";
import { AccessError } from "@/lib/saas/identity";
import { aiModel, AIServiceError } from "@/lib/ai/server";
import { aiErrors, classifyAIError, type AIErrorCode } from "@/lib/ai/errors";
import { hongKongDay } from "@/lib/ai/protocol";
import {
  copilotContext,
  requestSchema,
  snapshotSchema,
  type CopilotContext,
  type CopilotAnswer,
  type Feedback,
  type Message,
  type Task,
  type Thread,
  type Fact,
} from "./model";
import { factsFor, observations } from "./observations";
import { generateCopilot } from "./generate";

function checked(error: { message?: string; code?: string } | null) {
  if (!error) return;
  const text = error.message ?? "";
  if (/access_denied|product_required|brand_scope|customer_scope/.test(text))
    throw new AccessError("你無權使用此公司、產品或客戶資料。", 403);
  if (/daily_limit/.test(text))
    throw new AccessError("今日 AI 用量已達上限，香港時間午夜後重設。", 429);
  if (/copilot_quiet/.test(text))
    throw new AccessError("C 會留返空間畀你，稍後再提供新觀察。", 429);
  if (
    /context_changed|idempotency|ai_busy/.test(text) ||
    error.code === "23505"
  )
    throw new AccessError("資料或請求狀態已更新，請先重新核對。", 409);
  if (/disabled/.test(text))
    throw new AccessError("公司 AI 已暫停，請由擁有人啟用。", 409);
  if (error.code === "P0002")
    throw new AccessError("找不到此任務或記錄。", 404);
  throw new AccessError("C 暫時未能讀取完整工作資料，請稍後再試。", 503);
}
async function access(companyId: string, context: CopilotContext) {
  z.uuid().parse(companyId);
  const a = await requireCompany(companyId);
  requireProduct(a.products, context.product);
  return a;
}
async function snapshot(
  a: Awaited<ReturnType<typeof access>>,
  context: CopilotContext,
) {
  const r = await a.db.rpc("sv_copilot_snapshot", {
    p_company: a.company.id,
    p_actor: a.user.id,
    p_product: context.product,
    p_brand: context.brandId ?? null,
    p_customer: context.customerId ?? null,
  });
  checked(r.error);
  return snapshotSchema.parse(r.data);
}
async function feedbackFor(a: Awaited<ReturnType<typeof access>>) {
  const r = await a.db
    .from("sv_copilot_feedback")
    .select("signal_key,family,subject,status,until,updated_at")
    .eq("company_id", a.company.id)
    .eq("actor_id", a.user.id)
    .gt("until", new Date().toISOString())
    .order("updated_at", { ascending: false })
    .limit(200);
  checked(r.error);
  return (r.data ?? []) as Feedback[];
}
async function configurationFact(
  a: Awaited<ReturnType<typeof access>>,
  context: CopilotContext,
  area: "flows" | "bots" | "catalog" | "appointments" | "team",
): Promise<Fact> {
  const auth = await a.db.rpc("sv_copilot_authorize", {
    p_company: a.company.id,
    p_actor: a.user.id,
    p_product: context.product,
    p_write: true,
  });
  checked(auth.error);
  const source = `公司正式工作區 · ${new Date().toISOString()} · 只讀設定，不代表執行或可用時段`;
  if (area === "team") {
    const r = await a.db
      .from("sv_memberships")
      .select("role", { count: "exact" })
      .eq("company_id", a.company.id)
      .eq("status", "active");
    checked(r.error);
    return {
      id: "workspace:team",
      label: "團隊設定",
      value: `在職成員 ${r.count ?? 0} 位；角色 ${JSON.stringify(r.data)}；未接駁更表、休假及實時在席狀態，不能據此承諾邊位同事有空。`,
      source,
    };
  }
  requireProduct(
    a.products,
    area === "flows" || area === "bots" ? "crm" : "pos",
  );
  const r = await a.db
    .from("sv_workspaces")
    .select("payload,revision")
    .eq("company_id", a.company.id)
    .single();
  checked(r.error);
  const state = appSchema.parse(r.data?.payload);
  const brand = (id: string) => !context.brandId || id === context.brandId;
  let rows: unknown[] = [],
    total = 0;
  if (area === "flows") {
    const items = state.studio.flows.filter((f) => brand(f.brandId));
    total = items.length;
    rows = items.slice(0, 10).map((f) => ({
      name: f.name,
      brandId: f.brandId,
      description: f.description,
      nodes: f.nodes.map((n) => ({
        kind: n.kind,
        label: n.title,
        settings: Object.fromEntries(
          Object.entries(n.config).filter(([key]) =>
            [
              "text",
              "message",
              "service",
              "serviceId",
              "question",
              "tag",
              "goal",
              "delayMinutes",
            ].includes(key),
          ),
        ),
      })),
      edges: f.edges,
    }));
  }
  if (area === "bots") {
    const items = state.studio.bots.filter((b) => brand(b.brandId));
    total = items.length;
    rows = items.slice(0, 20).map((b) => ({
      name: b.name,
      brandId: b.brandId,
      mode: b.mode,
      tone: b.tone,
      allowService: b.allowService,
      allowLocation: b.allowLocation,
      allowHours: b.allowHours,
    }));
  }
  if (area === "catalog") {
    const items = (state.pos?.catalog ?? []).filter((s) => brand(s.brandId));
    total = items.length;
    rows = items.slice(0, 50).map((s) => ({
      name: s.name,
      brandId: s.brandId,
      kind: s.kind,
      price: `HK$${(s.priceCents / 100).toFixed(2)}`,
      durationMinutes: s.durationMinutes,
      active: s.active,
    }));
  }
  if (area === "appointments") {
    let query = a.db
      .from("sv_pos_appointments")
      .select("status,starts_at,ends_at,guests,snapshot", { count: "exact" })
      .eq("company_id", a.company.id)
      .gte("starts_at", Date.now() - 30 * 86400000)
      .lte("starts_at", Date.now() + 90 * 86400000)
      .order("starts_at");
    if (context.brandId) query = query.eq("brand_id", context.brandId);
    if (context.customerId) query = query.eq("contact_id", context.customerId);
    const ap = await query.limit(50);
    checked(ap.error);
    total = ap.count ?? 0;
    rows = (ap.data ?? []).map((p) => ({
      status: p.status,
      startsAt: new Date(Number(p.starts_at)).toISOString(),
      endsAt: new Date(Number(p.ends_at)).toISOString(),
      guests: p.guests,
      serviceName: p.snapshot.serviceName,
    }));
  }
  while (rows.length && Buffer.byteLength(JSON.stringify(rows), "utf8") > 7500)
    rows.pop();
  return {
    id: `workspace:${area}`,
    label: {
      flows: "已保存流程",
      bots: "BOT設定",
      catalog: "POS服務目錄",
      appointments: "近期及未來預約",
      team: "團隊設定",
    }[area],
    value: JSON.stringify({
      total,
      returned: rows.length,
      coverage: total > rows.length ? "部分列表，不能當完整報表" : "完整列表",
      rows,
    }),
    source: source + ` · 工作區版本 ${r.data?.revision}`,
  };
}
async function messagesFor(
  a: Awaited<ReturnType<typeof access>>,
  threadId: string | undefined,
  product: string,
) {
  if (!threadId) return [];
  const t = await a.db
    .from("sv_copilot_threads")
    .select("id")
    .eq("company_id", a.company.id)
    .eq("actor_id", a.user.id)
    .eq("product", product)
    .eq("id", z.uuid().parse(threadId))
    .maybeSingle();
  checked(t.error);
  if (!t.data) return [];
  const r = await a.db
    .from("sv_copilot_messages")
    .select("id,role,body,result,created_at")
    .eq("company_id", a.company.id)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(100);
  checked(r.error);
  return (r.data ?? []).reverse() as Message[];
}
export async function readCopilot(
  companyId: string,
  raw: unknown,
  threadId?: string,
) {
  const context = copilotContext.parse(raw),
    a = await access(companyId, context),
    model = aiModel();
  const [data, feedback, threads, tasks, settings, usage, messages, runtime] =
    await Promise.all([
      snapshot(a, context),
      feedbackFor(a),
      a.db
        .from("sv_copilot_threads")
        .select("id,title,product,updated_at")
        .eq("company_id", companyId)
        .eq("actor_id", a.user.id)
        .eq("product", context.product)
        .order("updated_at", { ascending: false })
        .limit(30),
      context.product === "crm"
        ? a.db
            .from("sv_copilot_briefs")
            .select("id,title,status,revision,plan,created_at")
            .eq("company_id", companyId)
            .eq("actor_id", a.user.id)
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [], error: null }),
      a.db
        .from("sv_ai_settings")
        .select("enabled,daily_limit")
        .eq("company_id", companyId)
        .maybeSingle(),
      a.db
        .from("sv_ai_requests")
        .select("request_id", { head: true, count: "exact" })
        .eq("company_id", companyId)
        .gte("created_at", hongKongDay(Date.now()) + "T00:00:00+08:00"),
      messagesFor(a, threadId, context.product),
      a.db
        .from("sv_ai_runtime")
        .select("status,model")
        .eq("id", "platform")
        .maybeSingle(),
    ]);
  for (const r of [threads, tasks, settings, usage, runtime]) checked(r.error);
  return {
    companyName: a.company.name,
    actorName: a.actor.name,
    context,
    observations: observations(data, context, feedback),
    feedback,
    facts: factsFor(data).map(({ value, ...f }) => ({
      ...f,
      value: f.id === "customer-message" ? value.slice(0, 180) : value,
    })),
    threads: (threads.data ?? []) as Thread[],
    tasks: (tasks.data ?? []) as Task[],
    messages,
    ai: {
      enabled: settings.data?.enabled ?? false,
      model,
      canGenerate: a.actor.role !== "viewer",
      canConfigure: a.actor.role === "owner",
      used: usage.count ?? 0,
      limit: settings.data?.daily_limit ?? 30,
      verified:
        runtime.data?.model === model && runtime.data?.status === "ready",
    },
    at: data.at,
    brands: data.brands,
    threadId: threadId ?? null,
  };
}
function outcome(row: {
  status: string;
  result: unknown;
  error_code?: string;
}) {
  if (row.status === "completed" && row.result) return row.result;
  if (row.status === "running") return { state: "running" };
  if (row.error_code === "context_changed")
    throw new AccessError(
      "生成期間公司資料有更新，請為最新資料重新準備。",
      409,
    );
  if (row.error_code === "disabled")
    throw new AccessError("公司 AI 已暫停。", 409);
  throw new AIServiceError(
    row.error_code ?? "unavailable",
    aiErrors[row.error_code as AIErrorCode] ?? aiErrors.unavailable,
  );
}
export async function askCopilot(companyId: string, raw: unknown) {
  const request = requestSchema.parse(raw),
    a = await access(companyId, request.context);
  if (a.actor.role === "viewer")
    throw new AccessError("你目前只有檢視權限。", 403);
  const hash = createHash("sha256")
    .update(JSON.stringify(request))
    .digest("hex");
  const existing = await a.db
    .from("sv_ai_requests")
    .select("actor_id,request_hash,source,status,result,error_code")
    .eq("company_id", companyId)
    .eq("request_id", request.requestId)
    .maybeSingle();
  checked(existing.error);
  if (existing.data) {
    if (
      existing.data.actor_id !== a.user.id ||
      existing.data.source !== "copilot" ||
      existing.data.request_hash !== hash
    )
      throw new AccessError("此請求已屬於其他內容，請核對原有結果。", 409);
    return readCopilotReceipt(companyId, request.context, request.requestId);
  }
  const [data, feedback, history] = await Promise.all([
    snapshot(a, request.context),
    feedbackFor(a),
    messagesFor(a, request.threadId, request.context.product),
  ]);
  const model = aiModel();
  if (!model) throw new AccessError("營運方尚未設定 AI 模型。", 503);
  if (request.mode === "proactive") {
    const signal = observations(data, request.context, feedback).find(
      (o) => o.key === request.signalKey && o.kind !== "setup",
    );
    if (!signal)
      throw new AccessError("呢個觀察已更新，C 會以最新資料再判斷。", 409);
    request.message = signal.prompt;
  }
  const claim = await a.db.rpc("sv_copilot_claim", {
    p_company: companyId,
    p_actor: a.user.id,
    p_product: request.context.product,
    p_request: request.requestId,
    p_thread: request.threadId,
    p_brand: request.context.brandId ?? data.brands[0]?.id,
    p_hash: hash,
    p_message: request.message,
    p_revision: data.revision,
    p_model: model,
    p_feature: request.mode === "proactive" ? "proactive" : "copilot",
  });
  checked(claim.error);
  if (!claim.data.dispatch) return outcome(claim.data);
  let answer: CopilotAnswer | null = null,
    errorCode: string | null = null,
    input: number | null = null,
    output: number | null = null;
  try {
    const result = await generateCopilot({
      model,
      companyName: a.company.name,
      context: request.context,
      facts: [
        {
          id: "products",
          label: "公司已啟用產品",
          value: JSON.stringify(a.products),
          source: "此公司目前有效訂閱；不能視未啟用產品為可用功能。",
        },
        ...factsFor(data),
      ],
      history,
      message: request.message,
      proactive: request.mode === "proactive",
      searchMemory: async (query) => {
        const r = await a.db.rpc("sv_copilot_memory", {
          p_company: companyId,
          p_actor: a.user.id,
          p_product: request.context.product,
          p_query: query,
        });
        checked(r.error);
        return r.data;
      },
      readConfiguration: (area) => configurationFact(a, request.context, area),
    });
    input = result.input;
    output = result.outputTokens;
    answer = {
      ...result.output,
      requestId: request.requestId,
      threadId: request.threadId,
      facts: result.facts
        .filter((f) => result.output.factIds.includes(f.id))
        .map((f) =>
          f.id.startsWith("knowledge:")
            ? {
                ...f,
                value: result.output.evidence
                  .filter((e) => e.factId === f.id)
                  .map((e) => e.quote)
                  .join("\n"),
              }
            : f,
        ),
      evidence: [],
      createdAt: new Date().toISOString(),
      usage: { input, output },
      scope: request.context,
    };
  } catch (e) {
    errorCode =
      e instanceof Error &&
      /Unknown evidence|Unsupported|Unexecuted/.test(e.message)
        ? "answer_verification_failed"
        : classifyAIError(e);
  }
  const done = await a.db.rpc("sv_copilot_finish", {
    p_company: companyId,
    p_actor: a.user.id,
    p_request: request.requestId,
    p_result: answer,
    p_error: errorCode,
    p_input: input,
    p_output: output,
  });
  checked(done.error);
  return outcome(done.data);
}
const base = { commandId: z.uuid(), context: copilotContext };
const commandSchema = z.discriminatedUnion("action", [
  z
    .object({
      ...base,
      action: z.literal("feedback"),
      key: z.string().min(1).max(120),
      family: z.string().min(1).max(40),
      subject: z.string().min(1).max(100),
      status: z.enum(["seen", "dismissed", "snoozed", "accepted"]),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("tag"),
      key: z.string().min(1).max(120),
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({ ...base, action: z.literal("save-brief"), requestId: z.uuid() })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("brief-status"),
      id: z.uuid(),
      revision: z.number().int().nonnegative(),
      status: z.enum(["draft", "ready", "complete", "cancelled"]),
    })
    .strict(),
  z
    .object({ ...base, action: z.literal("configure"), enabled: z.boolean() })
    .strict(),
]);
export async function actCopilot(companyId: string, raw: unknown) {
  const command = commandSchema.parse(raw),
    a = await access(companyId, command.context);
  if (a.actor.role === "viewer")
    throw new AccessError("你目前只有檢視權限。", 403);
  const previous = await a.db
    .from("sv_copilot_commands")
    .select("actor_id,request,result")
    .eq("company_id", companyId)
    .eq("command_id", command.commandId)
    .maybeSingle();
  checked(previous.error);
  let payload: Record<string, unknown> = { client: command };
  if (previous.data) {
    if (
      previous.data.actor_id !== a.user.id ||
      !isDeepStrictEqual(previous.data.request.client, command)
    )
      throw new AccessError("同一操作不可改成另一內容。", 409);
    payload = previous.data.request;
  } else if (command.action === "tag") {
    const data = await snapshot(a, command.context),
      observation = observations(data, command.context).find(
        (o) => o.key === command.key,
      );
    if (!observation || observation.action.kind !== "tag")
      throw new AccessError("客戶或對話已更新，請核對最新標籤建議。", 409);
    payload = { client: command, ...observation.action };
  }
  const result = await a.db.rpc("sv_copilot_action", {
    p_company: companyId,
    p_actor: a.user.id,
    p_product: command.context.product,
    p_command: command.commandId,
    p_data: payload,
  });
  checked(result.error);
  return result.data;
}
export async function readCopilotReceipt(
  companyId: string,
  raw: unknown,
  requestId: string,
) {
  const context = copilotContext.parse(raw),
    a = await access(companyId, context);
  const r = await a.db.rpc("sv_copilot_receipt", {
    p_company: companyId,
    p_actor: a.user.id,
    p_product: context.product,
    p_request: z.uuid().parse(requestId),
  });
  checked(r.error);
  return outcome(r.data);
}
