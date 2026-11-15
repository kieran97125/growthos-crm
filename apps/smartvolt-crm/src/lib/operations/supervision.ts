import { z } from "zod";
export const officePolicy = z
  .object({
    timeZone: z.string().min(1).max(100),
    hoursEnabled: z.boolean(),
    responseMinutes: z.number().int().min(1).max(10080),
    weekly: z
      .array(
        z
          .object({
            day: z.number().int().min(1).max(7),
            start: z.number().int().min(0).max(1439),
            end: z.number().int().min(1).max(1440),
          })
          .strict(),
      )
      .min(1)
      .max(21),
    holidays: z.array(z.iso.date()).max(366),
  })
  .strict()
  .superRefine((d, c) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: d.timeZone }).format(0);
    } catch {
      c.addIssue({ code: "custom", message: "請選擇有效時區。" });
    }
    for (const [i, s] of d.weekly.entries()) {
      if (s.start >= s.end)
        c.addIssue({
          code: "custom",
          path: ["weekly", i],
          message: "結束時間要遲過開始時間。",
        });
      if (
        d.weekly.some(
          (x, j) =>
            j < i &&
            x.day === s.day &&
            Math.max(s.start, x.start) < Math.min(s.end, x.end),
        )
      )
        c.addIssue({
          code: "custom",
          path: ["weekly", i],
          message: "同一日嘅工作時段不能重疊。",
        });
    }
  });
export type OfficePolicy = z.infer<typeof officePolicy>;
export type SupervisionPage = {
  brands: { id: string; name: string }[];
  period: { from: string; to: string };
  coverageFrom: string;
  checkedAt: string;
  policy: { revision: number; data: OfficePolicy } | null;
  nextCursor: string | null;
  metrics: {
    pending: number;
    overdue: number;
    unmeasured: number;
    episodes: number;
    humanAnswered: number;
    automatedAnswered: number;
    averageResponseMinutes: number | null;
    withinTarget: number;
    resolved: number;
    reopened: number;
  };
  queue: {
    key: string;
    provider: "meta" | "whatsapp";
    thread_id: string;
    customer_id: string;
    brand_id: string;
    channel: string;
    customer_name: string;
    owner_name: string | null;
    started_at: string | null;
    response_due_at: string | null;
    first_automation_at: string | null;
    sort_at: string;
    measured: boolean;
    editing: boolean;
    editor_name: string | null;
  }[];
};
