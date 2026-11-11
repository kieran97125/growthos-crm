import { z } from "zod";

export const roleSchema = z.enum(["owner", "manager", "agent", "viewer"]);
export type Role = z.infer<typeof roleSchema>;
export const scopeSchema = z.object({
  companyId: z.string().min(1).max(100),
  companyName: z.string().min(1).max(100),
  brands: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        name: z.string().min(1).max(100),
        short: z.string().max(20),
      }),
    )
    .min(1)
    .max(30),
  team: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        name: z.string().min(1).max(80),
        initials: z.string().max(4),
      }),
    )
    .min(1)
    .max(100),
});
export type CompanyScope = z.infer<typeof scopeSchema>;
export type Actor = { id: string; name: string; role: Role };
export const canManage = (role: Role) => role === "owner" || role === "manager";
export class AccessError extends Error {
  constructor(
    message: string,
    public status = 403,
  ) {
    super(message);
  }
}
