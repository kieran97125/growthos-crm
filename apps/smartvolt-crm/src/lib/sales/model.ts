import { z } from "zod";
export const salesAction = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("setting"),
      commandId: z.uuid(),
      brandId: z.string().min(1).max(100),
      enabled: z.boolean(),
      revision: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      action: z.literal("update"),
      commandId: z.uuid(),
      id: z.uuid(),
      status: z.enum(["new", "contacted", "demo_scheduled", "closed"]),
      ownerId: z.uuid().nullable(),
      followUpAt: z.iso.datetime({ offset: true }).nullable(),
      note: z.string().max(2000),
      revision: z.number().int().nonnegative(),
    })
    .strict(),
]);
export type SalesPage = {
  available: boolean;
  canConfigure: boolean;
  canManage: boolean;
  canEdit: boolean;
  setting: { brandId: string; enabled: boolean; revision: number } | null;
  brands: { id: string; name: string }[];
  total: number;
  next: string | null;
  rows: {
    source_id: string;
    customer_id: string;
    brand_id: string;
    reference: string;
    source_created_at: string;
    status: string;
    owner_id: string | null;
    follow_up_at: string | null;
    note: string;
    revision: number;
    source_snapshot: {
      name: string;
      company_name: string;
      phone: string;
      email: string;
      message: string;
      interest: string;
      marketing_consent: boolean;
      consent_version: string;
    };
  }[];
  members: { id: string; name: string }[];
};
