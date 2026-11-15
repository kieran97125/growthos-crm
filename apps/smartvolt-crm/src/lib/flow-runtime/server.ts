import "server-only";
import { z } from "zod";
import { requireCompany } from "@/lib/saas/server";
import { catchUpFlows } from "./runtime";
export { catchUpFlows } from "./runtime";
import { requireProduct } from "@/lib/saas/products";
import { AccessError } from "@/lib/saas/identity";
import { engagementFailure, readEngagement } from "@/lib/engagement/server";
import { refreshTemplates } from "@/lib/engagement/runtime";
import { prepareTemplateDefinition } from "@/lib/engagement/templates";
import {
  flowActionSchema,
  validateLiveFlow,
  type FlowRuntimePage,
} from "./model";

async function access(company: string) {
  z.uuid().parse(company);
  const a = await requireCompany(company);
  requireProduct(a.products, "crm");
  return a;
}
export async function readFlowRuntime(
  company: string,
  raw: unknown,
): Promise<FlowRuntimePage> {
  const a = await access(company),
    q = z
      .object({
        flow: z.string().min(1).max(100),
        before: z.iso.datetime({ offset: true }).optional(),
        beforeId: z.uuid().optional(),
      })
      .strict()
      .parse(raw);
  if (!!q.before !== !!q.beforeId)
    throw new AccessError("分頁位置失效，請重新讀取。", 400);
  const r = await a.db.rpc("sv_flow_read", {
    p_company: company,
    p_actor: a.user.id,
    p_flow: q.flow,
    p_before: q.before ?? null,
    p_before_id: q.beforeId ?? null,
  });
  engagementFailure(r.error);
  const engagement = await readEngagement(company, {});
  const all = r.data.runs as FlowRuntimePage["runs"],
    runs = all.slice(0, 20),
    last = runs.at(-1);
  return {
    ...r.data,
    runs,
    canManage: ["owner", "manager"].includes(a.actor.role),
    canEdit: a.actor.role !== "viewer",
    hasPos: a.products.includes("pos"),
    connections: engagement.connections,
    templates: engagement.templates,
    nextCursor:
      all.length > 20 && last
        ? new URLSearchParams({
            before: last.created_at,
            beforeId: last.id,
          }).toString()
        : null,
  };
}
export async function actFlowRuntime(company: string, raw: unknown) {
  const a = await access(company),
    action = flowActionSchema.parse(raw);
  if (a.actor.role === "viewer")
    throw new AccessError("你目前只有檢視權限。", 403);
  const original = structuredClone(action);
  // Confirm an immutable request before refreshing providers, including retry after lost response.
  const replay = await a.db.rpc("sv_flow_receipt", {
    p_company: company,
    p_actor: a.user.id,
    p_command: action.commandId,
    p_request: original,
  });
  engagementFailure(replay.error);
  if (replay.data) return replay.data;
  if (action.action === "publish") {
    const issues = validateLiveFlow(
      action.flow,
      action.provider,
      action.deliveries,
    );
    if (issues.length) throw new AccessError(issues[0], 400);
    if (Object.values(action.deliveries).some((d) => d.kind === "template")) {
      let inventory;
      try {
        inventory = await refreshTemplates(company, action.connectionId);
      } catch {
        throw new AccessError("未能核實官方模板，請同步後再發布。", 409);
      }
      for (const [key, definition] of Object.entries(action.deliveries)) {
        try {
          action.deliveries[key] = prepareTemplateDefinition(
            definition,
            inventory,
          );
        } catch {
          throw new AccessError("正式模板已更新，請重新選擇。", 409);
        }
      }
    }
  }
  const r = await a.db.rpc("sv_flow_action", {
    p_company: company,
    p_actor: a.user.id,
    p_command: action.commandId,
    p_action: action.action,
    p_data: action,
    p_request: original,
  });
  engagementFailure(r.error);
  await catchUpFlows(company);
  return r.data;
}
