import "server-only";
import { z } from "zod";
import { requireCompany } from "@/lib/saas/server";
import { requireProduct } from "@/lib/saas/products";
import { AccessError } from "@/lib/saas/identity";
import { engagementFailure } from "@/lib/engagement/server";
import { notificationAction, type NotificationPage } from "./model";
import { pushConfiguration, dispatchNotifications } from "./runtime";
async function access(company: string) {
  z.uuid().parse(company);
  const a = await requireCompany(company);
  requireProduct(a.products, "crm");
  return a;
}
export async function readNotifications(
  company: string,
  raw: unknown,
): Promise<NotificationPage> {
  const a = await access(company),
    q = z
      .object({
        before: z.iso.datetime({ offset: true }).optional(),
        id: z.uuid().optional(),
      })
      .strict()
      .refine((x) => !!x.before === !!x.id)
      .parse(raw),
    r = await a.db.rpc("sv_notification_read", {
      p_company: company,
      p_actor: a.user.id,
      p_before: q.before ?? null,
      p_id: q.id ?? null,
    });
  engagementFailure(r.error);
  const d = r.data as NotificationPage,
    rows = d.rows.slice(0, 30),
    last = rows.at(-1),
    config = pushConfiguration();
  return {
    ...d,
    rows,
    next:
      d.rows.length > 30 && last
        ? new URLSearchParams({
            before: last.created_at,
            id: last.id,
          }).toString()
        : null,
    pushConfigured: !!config,
    publicKey: config?.publicKey ?? null,
  };
}
export async function actNotification(company: string, raw: unknown) {
  const a = await access(company),
    c = notificationAction.parse(raw);
  if (c.action === "device" && !pushConfiguration())
    throw new AccessError("裝置推播尚未啟用；工作台提醒已可使用。", 503);
  if (
    c.action === "snooze" &&
    (Date.parse(c.until) <= Date.now() ||
      Date.parse(c.until) > Date.now() + 30 * 86400000)
  )
    throw new AccessError("請選擇未來 30 日內嘅提醒時間。", 400);
  if (c.action === "preferences" && c.data.push && !pushConfiguration())
    throw new AccessError("裝置推播尚未啟用。", 503);
  const { commandId, action, ...data } = c,
    r = await a.db.rpc("sv_notification_action", {
      p_company: company,
      p_actor: a.user.id,
      p_command: commandId,
      p_kind: action,
      p_data: data,
    });
  engagementFailure(r.error);
  if (action === "device") await dispatchNotifications(company, a.user.id);
  return r.data;
}
