import "server-only";
import { z } from "zod";
import { requireCompany } from "@/lib/saas/server";
import { requireProduct } from "@/lib/saas/products";
import { AccessError } from "@/lib/saas/identity";
import { engagementFailure } from "@/lib/engagement/server";
import type { ReportPage } from "./model";
async function access(company: string) {
  z.uuid().parse(company);
  const a = await requireCompany(company);
  requireProduct(a.products, "crm");
  if (!["owner", "manager"].includes(a.actor.role))
    throw new AccessError("成效報表只供公司擁有人及管理員使用。", 403);
  return a;
}
export async function readReports(
  company: string,
  raw: unknown,
): Promise<ReportPage> {
  const a = await access(company),
    q = z
      .object({
        from: z.iso.date().optional(),
        to: z.iso.date().optional(),
        asOf: z.iso.datetime({ offset: true }).optional(),
        brand: z.string().min(1).max(100).optional(),
        mode: z.enum(["period", "cohort"]).optional(),
        before: z.iso.datetime({ offset: true }).optional(),
        id: z.uuid().optional(),
        eventBefore: z.iso.datetime({ offset: true }).optional(),
        eventId: z.uuid().optional(),
      })
      .strict()
      .refine((x) => !!x.before === !!x.id && !!x.eventBefore === !!x.eventId)
      .parse(raw),
    day = (ms: number) => new Date(ms + 8 * 3600000).toISOString().slice(0, 10),
    from = q.from ?? day(Date.now() - 29 * 86400000),
    to = q.to ?? day(Date.now()),
    asOf = q.asOf ?? new Date().toISOString();
  if (
    from > to ||
    Date.parse(to) - Date.parse(from) > 365 * 86400000 ||
    Date.parse(asOf) > Date.now() + 60000
  )
    throw new AccessError("請選擇一年內嘅日期及有效統計截止時間。", 400);
  const r = await a.db.rpc("sv_reports_read", {
    p_company: company,
    p_actor: a.user.id,
    p_from: from + "T00:00:00+08:00",
    p_to: new Date(Date.parse(to + "T00:00:00+08:00") + 86400000).toISOString(),
    p_as_of: asOf,
    p_brand: q.brand ?? null,
    p_mode: q.mode ?? "period",
    p_before: q.before ?? null,
    p_id: q.id ?? null,
    p_event_before: q.eventBefore ?? null,
    p_event_id: q.eventId ?? null,
  });
  engagementFailure(r.error);
  const d = r.data as ReportPage,
    campaigns = d.campaigns.slice(0, 30),
    last = campaigns.at(-1),
    events = d.events.slice(0, 50),
    lastEvent = events.at(-1);
  return {
    ...d,
    campaigns,
    events,
    nextCampaign:
      d.campaigns.length > 30 && last
        ? new URLSearchParams({
            before: last.created_at,
            id: last.id,
          }).toString()
        : null,
    nextEvent:
      d.events.length > 50 && lastEvent
        ? new URLSearchParams({
            eventBefore: lastEvent.observed_at,
            eventId: lastEvent.id,
          }).toString()
        : null,
    canManageCosts: a.actor.role !== "viewer" && a.products.includes("pos"),
    query: { from, to, asOf, brand: q.brand ?? "", mode: q.mode ?? "period" },
  };
}
export async function recordCampaignCost(company: string, raw: unknown) {
  const a = await access(company),
    c = z
      .object({
        commandId: z.uuid(),
        id: z.uuid(),
        revision: z.number().int().nonnegative(),
        amountCents: z.number().int().min(0).max(100000000000),
        source: z.string().trim().min(1).max(500),
      })
      .strict()
      .parse(raw),
    r = await a.db.rpc("sv_campaign_cost_action", {
      p_company: company,
      p_actor: a.user.id,
      p_command: c.commandId,
      p_id: c.id,
      p_revision: c.revision,
      p_amount: c.amountCents,
      p_source: c.source,
    });
  engagementFailure(r.error);
  return r.data;
}
