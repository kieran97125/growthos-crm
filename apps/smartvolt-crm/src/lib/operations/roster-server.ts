import "server-only";
import { z } from "zod";
import { requireCompany } from "@/lib/saas/server";
import { requireProduct } from "@/lib/saas/products";
import { engagementFailure } from "@/lib/engagement/server";
import { rosterAction, rosterProfile, type RosterPage } from "./roster";
async function access(company: string) {
  z.uuid().parse(company);
  const a = await requireCompany(company);
  requireProduct(a.products, "crm");
  return a;
}
export async function readRoster(
  company: string,
  raw: unknown,
): Promise<RosterPage> {
  const a = await access(company),
    q = z
      .object({
        provider: z.enum(["whatsapp", "meta"]).optional(),
        thread: z.uuid().optional(),
      })
      .strict()
      .refine((x) => !!x.provider === !!x.thread)
      .parse(raw);
  const r = await a.db.rpc("sv_roster_read", {
    p_company: company,
    p_actor: a.user.id,
    p_provider: q.provider ?? null,
    p_thread: q.thread ?? null,
  });
  engagementFailure(r.error);
  return r.data;
}
export async function actRoster(company: string, raw: unknown) {
  const a = await access(company),
    c = rosterAction.parse(raw);
  if (c.action === "member") {
    rosterProfile.parse(
      Object.fromEntries(
        Object.entries(c).filter(
          ([k]) => !["commandId", "action", "userId"].includes(k),
        ),
      ),
    );
  }
  const { commandId, action, ...data } = c,
    r = await a.db.rpc("sv_roster_action", {
      p_company: company,
      p_actor: a.user.id,
      p_command: commandId,
      p_kind: action,
      p_data: data,
    });
  engagementFailure(r.error);
  return r.data;
}
