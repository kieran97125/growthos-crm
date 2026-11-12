import { z } from "zod";
export function canonicalAppOrigin(value = process.env.SMARTVOLT_APP_URL) {
  if (!value) throw new Error("auth_origin_unconfigured");
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("invalid_auth_origin");
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (
    url.protocol !== "https:" &&
    !(
      process.env.NODE_ENV !== "production" &&
      local &&
      url.protocol === "http:"
    )
  )
    throw new Error("insecure_auth_origin");
  return url.origin;
}
export const confirmationSchema = z.object({
  token_hash: z.string().regex(/^[A-Za-z0-9_-]{20,512}$/),
  type: z.enum(["invite", "recovery"]),
});
export const newPasswordSchema = z
  .object({
    password: z.string().min(12).max(128),
    confirmation: z.string().max(128),
  })
  .refine((v) => v.password === v.confirmation);
