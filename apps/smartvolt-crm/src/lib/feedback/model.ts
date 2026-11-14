import { z } from "zod";
const brand = z.string().min(1).max(100),
  id = z.string().regex(/^[1-9][0-9]{1,39}$/);
export const feedbackAction = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("setting"),
      commandId: z.uuid(),
      brandId: brand,
      datasetId: id,
      businessId: id,
      adAccountId: id,
      token: z
        .string()
        .max(8192)
        .refine((x) => !/[\s\u0000-\u001f]/.test(x))
        .optional(),
      enabled: z.boolean(),
      mode: z.enum(["test", "live"]),
      testCode: z
        .string()
        .regex(/^[A-Za-z0-9_-]{1,100}$/)
        .nullable(),
      revision: z.number().int().nonnegative(),
      authorized: z.literal(true),
    })
    .strict()
    .refine(
      (x) => x.mode !== "test" || !!x.testCode,
      "測試模式要填寫 Meta 測試代碼。",
    ),
  z
    .object({
      action: z.literal("consent"),
      commandId: z.uuid(),
      brandId: brand,
      customerId: brand,
      allowed: z.boolean(),
      consentedAt: z.iso.datetime({ offset: true }),
      source: z.string().trim().min(1).max(500),
      revision: z.number().int().nonnegative(),
    })
    .strict(),
]);
export type FeedbackPage = {
  selectedBrand: string;
  canConfigure: boolean;
  brands: { id: string; name: string }[];
  consents: {
    brandId: string;
    allowed: boolean;
    consentedAt: string;
    source: string;
    revision: number;
  }[];
  settings: {
    brandId: string;
    datasetId: string;
    businessId: string;
    adAccountId: string;
    label: string;
    enabled: boolean;
    mode: "test" | "live";
    testCode: string | null;
    verifiedAt: string;
    revision: number;
  }[];
  jobs: {
    id: string;
    brand_id: string;
    event_name: string;
    mode: string;
    event_id: string;
    state: string;
    reason: string | null;
    receipt: { eventsReceived?: number; traceId?: string } | null;
    created_at: string;
    source_key: string;
    product: string;
  }[];
  next: string | null;
};
export const feedbackState: Record<string, string> = {
  scheduled: "等待回傳",
  dispatching: "提交中",
  accepted: "Meta 已接收",
  failed: "未獲接收",
  unknown: "結果待核對",
  skipped: "未符合條件",
};
