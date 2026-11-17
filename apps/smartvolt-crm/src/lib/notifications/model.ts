import { z } from "zod";
export const notificationPreferences = z
  .object({
    assignment: z.boolean(),
    followup: z.boolean(),
    sla: z.boolean(),
    observation: z.boolean().optional(),
    website: z.boolean().optional(),
    push: z.boolean(),
    quietStart: z.number().int().min(0).max(23),
    quietEnd: z.number().int().min(0).max(23),
  })
  .strict();
const command = { commandId: z.uuid() };
const endpoint = z
  .url()
  .max(4096)
  .refine((s) => {
    const u = new URL(s);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      !u.hash &&
      [
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
      ].includes(u.hostname) &&
      u.pathname.length > 1
    );
  }, "未支援呢個裝置嘅推播服務。");
export const notificationAction = z.discriminatedUnion("action", [
  z
    .object({
      ...command,
      action: z.literal("preferences"),
      revision: z.number().int().nonnegative(),
      data: notificationPreferences,
    })
    .strict(),
  z
    .object({
      ...command,
      action: z.literal("done"),
      id: z.uuid(),
      revision: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      ...command,
      action: z.literal("snooze"),
      id: z.uuid(),
      revision: z.number().int().nonnegative(),
      until: z.iso.datetime({ offset: true }),
    })
    .strict(),
  z
    .object({
      ...command,
      action: z.literal("device"),
      endpoint,
      p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}={0,1}$/),
      auth: z.string().regex(/^[A-Za-z0-9_-]{22}={0,2}$/),
      label: z.string().trim().min(1).max(80),
    })
    .strict(),
  z.object({ ...command, action: z.literal("revoke"), id: z.uuid() }).strict(),
]);
export type NotificationPage = {
  preferences: {
    data: z.infer<typeof notificationPreferences>;
    revision: number;
  };
  pushConfigured: boolean;
  publicKey: string | null;
  total: number;
  next: string | null;
  rows: {
    id: string;
    kind: string;
    title: string;
    href: string;
    revision: number;
    created_at: string;
    website?: {
      visitorName: string;
      site: string;
      humanWaiting: boolean;
      waitingMinutes?: number;
      humanRequestedAt: string | null;
      assigneeName: string | null;
      intent: string;
      summary: string;
      unanswered: string;
      preference: "cooperate" | "human_only";
    } | null;
    evidence?: {
      detail: string;
      evidence: string[];
      checkedAt: string;
      facts: { id: string; label: string; value: string; source: string }[];
    } | null;
  }[];
  devices: { id: string; label: string; active: boolean; created_at: string }[];
};
