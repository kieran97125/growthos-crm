import "server-only";
import { z } from "zod";
import { requireCompany } from "@/lib/saas/server";
import { requireProduct } from "@/lib/saas/products";
import { AccessError } from "@/lib/saas/identity";
import { journeyAction, type JourneyPage } from "./journeys";
import { engagementFailure } from "./server";
import { refreshTemplates } from "./runtime";
import { prepareTemplateDefinition } from "./templates";
import { wakeDelivery } from "./scheduler";
async function access(company: string) {
  z.uuid().parse(company);
  const a = await requireCompany(company);
  requireProduct(a.products, "crm");
  return a;
}
export async function readJourneys(
  company: string,
  raw: unknown,
): Promise<JourneyPage> {
  const a = await access(company),
    q = z
      .object({
        before: z.iso.datetime({ offset: true }).optional(),
        beforeId: z.uuid().optional(),
      })
      .strict()
      .parse(raw);
  const r = await a.db.rpc("sv_journey_read", {
    p_company: company,
    p_actor: a.user.id,
    p_after: q.before ?? null,
    p_after_id: q.beforeId ?? null,
  });
  engagementFailure(r.error);
  const all = r.data.journeys as JourneyPage["journeys"],
    journeys = all.slice(0, 30),
    last = journeys.at(-1);
  return {
    journeys,
    canManage: ["owner", "manager"].includes(a.actor.role),
    hasPos: a.products.includes("pos"),
    nextCursor:
      all.length > 30 && last
        ? new URLSearchParams({
            before: last.created_at,
            beforeId: last.id,
          }).toString()
        : null,
  };
}
export async function actJourney(company: string, raw: unknown) {
  const a = await access(company),
    action = journeyAction.parse(raw),
    { commandId, action: kind, ...data } = action;
  const original = structuredClone(data);
  const replay = await a.db.rpc("sv_journey_receipt", {
    p_company: company,
    p_actor: a.user.id,
    p_command: commandId,
    p_kind: kind,
    p_data: original,
  });
  engagementFailure(replay.error);
  if (replay.data) return replay.data;
  if (action.action === "publish") {
    const d = data as Omit<
      Extract<typeof action, { action: "publish" }>,
      "action" | "commandId"
    >;
    if (d.steps.some((s) => s.definition.kind === "template")) {
      let inventory;
      try {
        inventory = await refreshTemplates(company, d.connectionId);
      } catch {
        throw new AccessError("未能核實官方模板，請同步後再發佈流程。", 409);
      }
      for (const step of d.steps) {
        try {
          step.definition = prepareTemplateDefinition(
            step.definition,
            inventory,
          );
        } catch {
          throw new AccessError("模板或欄位已更新，請重新選擇。", 409);
        }
      }
    }
    if (
      d.provider === "meta" &&
      d.steps.some(
        (s) => s.definition.kind !== "text" || s.definition.body.length > 1000,
      )
    )
      throw new AccessError(
        "Meta 跟進訊息最多 1,000 字，並受 24 小時回覆時限限制。",
        400,
      );
  }
  const result = await a.db.rpc("sv_journey_action", {
    p_company: company,
    p_actor: a.user.id,
    p_command: commandId,
    p_kind: kind,
    p_data: data,
    p_request: original,
  });
  engagementFailure(result.error);
  try {
    await wakeDelivery(company);
  } catch {
    console.warn("journey_scheduler_pending", { company });
  }
  return result.data;
}
export async function readJourneyHistory(
  company: string,
  id: string,
  raw: unknown,
) {
  const a = await access(company);
  z.uuid().parse(id);
  const q = z
    .object({
      before: z.iso.datetime({ offset: true }).optional(),
      beforeId: z.uuid().optional(),
    })
    .strict()
    .parse(raw);
  const r = await a.db.rpc("sv_journey_history", {
    p_company: company,
    p_actor: a.user.id,
    p_journey: id,
    p_before: q.before ?? null,
    p_before_id: q.beforeId ?? null,
  });
  engagementFailure(r.error);
  const all = r.data.runs as { id: string; created_at: string }[],
    runs = all.slice(0, 30),
    last = runs.at(-1);
  return {
    ...r.data,
    runs,
    nextCursor:
      all.length > 30 && last
        ? new URLSearchParams({
            before: last.created_at,
            beforeId: last.id,
          }).toString()
        : null,
  };
}
