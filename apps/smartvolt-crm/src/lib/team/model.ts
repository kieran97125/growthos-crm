import { z } from "zod";
import { productSchema } from "@/lib/saas/products";
const grant = {
  name: z.string().trim().min(1).max(80),
  role: z.enum(["manager", "agent", "viewer"]),
  brandIds: z.array(z.string().min(1).max(100)).min(1).max(30).nullable(),
  productIds: z.array(productSchema).min(1).max(2),
};
export const teamAction = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("invite"),
      commandId: z.uuid(),
      email: z.email().trim().toLowerCase().max(160),
      ...grant,
    })
    .strict(),
  z
    .object({
      action: z.literal("member"),
      commandId: z.uuid(),
      userId: z.uuid(),
      revision: z.number().int().nonnegative(),
      status: z.enum(["active", "suspended", "removed"]),
      ...grant,
    })
    .strict(),
  z
    .object({ action: z.literal("revoke"), commandId: z.uuid(), id: z.uuid() })
    .strict(),
]);
export type TeamAction = z.infer<typeof teamAction>;
export type TeamMember = {
  user_id: string;
  display_name: string;
  role: "owner" | "manager" | "agent" | "viewer";
  status: "invited" | "active" | "suspended" | "removed";
  brand_ids: string[] | null;
  product_ids: ("crm" | "pos")[] | null;
  access_revision: number;
};
export type Invitation = {
  id: string;
  email: string;
  display_name: string;
  role: string;
  status: "invited" | "accepted" | "revoked";
  mail_state: "not_sent" | "submitting" | "submitted" | "failed";
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
};
export type TeamPage = {
  companyId: string;
  checkedAt: string;
  canEdit: boolean;
  seatLimit: number;
  usedSeats: number;
  brands: { id: string; name: string }[];
  products: ("crm" | "pos")[];
  members: TeamMember[];
  invitations: Invitation[];
  audit: {
    id: string;
    kind: string;
    target_user: string | null;
    created_at: string;
  }[];
  mailReady: boolean;
};
