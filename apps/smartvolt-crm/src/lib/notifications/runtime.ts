import { runBounded } from "@/lib/engagement/bounded";
import * as webpush from "web-push";
import { database } from "@/lib/saas/database";
import { checked } from "@/lib/engagement/runtime";
export function pushConfiguration() {
  const publicKey = process.env.SMARTVOLT_PUSH_PUBLIC_KEY,
    privateKey = process.env.SMARTVOLT_PUSH_PRIVATE_KEY;
  return publicKey && privateKey ? { publicKey, privateKey } : null;
}
export async function dispatchNotifications(company: string, actor: string) {
  const config = pushConfiguration();
  if (!config) return;
  const db = database(),
    r = await db.rpc("sv_push_claim", { p_company: company, p_actor: actor });
  checked(r.error);
  await runBounded(
    r.data as {
      notificationId: string;
      deviceId: string;
      endpoint: string;
      p256dh: string;
      auth: string;
    }[],
    5,
    async (a) => {
      let state = "unknown",
        reason: string | null = null,
        expired = false;
      try {
        const u = new URL(a.endpoint);
        if (
          ![
            "fcm.googleapis.com",
            "updates.push.services.mozilla.com",
            "web.push.apple.com",
          ].includes(u.hostname) ||
          u.protocol !== "https:" ||
          u.port ||
          u.username ||
          u.password
        ) {
          state = "failed";
          reason = "endpoint_invalid";
        } else {
          await webpush.sendNotification(
            { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
            JSON.stringify({
              title: "Convelta 有新跟進提醒",
              body: "開啟工作台查看。",
              tag: a.notificationId,
              url: `/company/${company}/crm/notifications`,
            }),
            {
              vapidDetails: { subject: "https://app.convelta.io", ...config },
              TTL: 60,
              timeout: 7000,
            },
          );
          state = "accepted";
        }
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        expired = code === 404 || code === 410;
        state = code ? "failed" : "unknown";
        reason = code ? "provider_" + code : "provider_result_unknown";
      }
      const result = await db.rpc("sv_push_finish", {
        p_company: company,
        p_actor: actor,
        p_notification: a.notificationId,
        p_device: a.deviceId,
        p_state: state,
        p_reason: reason,
        p_expired: expired,
      });
      checked(result.error);
    },
  );
}
