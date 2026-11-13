import { z } from "zod";
import { AccessError } from "@/lib/saas/identity";

/** Enforce the byte limit while streaming, including requests without Content-Length. */
export async function boundedBytes(
  request: Request,
  maximum: number,
): Promise<Buffer> {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maximum))
    throw new AccessError("請求資料超出大小限制。", 413);
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maximum) {
        await reader.cancel();
        throw new AccessError("請求資料超出大小限制。", 413);
      }
      chunks.push(part.value);
    }
    return Buffer.concat(chunks, total);
  } finally {
    reader.releaseLock();
  }
}
export async function boundedJson(request: Request): Promise<unknown> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new AccessError("請以 JSON 提交資料。", 415);
  const bytes = await boundedBytes(request, 32 * 1024);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new AccessError("請求 JSON 格式不正確。", 400);
  }
}
export const uuid = z.string().uuid();
export const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const messageBody = z
  .string()
  .min(1)
  .max(8192)
  .refine(
    (value) =>
      value.trim().length > 0 &&
      value.isWellFormed() &&
      Array.from(value).length <= 4096,
  );
export const sendInput = z
  .object({
    clientId: uuid,
    revision,
    body: messageBody,
    replyTo: uuid.optional(),
  })
  .strict();
export const commandInput = z
  .object({
    clientId: uuid,
    revision,
    kind: z.enum(["read", "resolve", "reopen", "note"]),
    body: messageBody.optional(),
    throughMessageId: uuid.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.kind === "note") !== (value.body !== undefined))
      context.addIssue({
        code: "custom",
        message: "A note requires body; other commands must omit it.",
      });
    if (value.throughMessageId !== undefined && value.kind !== "read")
      context.addIssue({
        code: "custom",
        message: "Only read accepts a message watermark.",
      });
    if (value.kind === "read" && value.throughMessageId === undefined)
      context.addIssue({
        code: "custom",
        message: "Read requires a message watermark.",
      });
  });
const graphId = z.string().regex(/^[1-9]\d{2,39}$/);
const secret = z
  .string()
  .min(16)
  .max(8192)
  .refine((s) => !/[\u0000-\u0020\u007f]/.test(s));
export const connectionInput = z
  .object({
    id: uuid.optional(),
    brandId: z.string().min(1).max(100),
    appId: graphId,
    accountId: graphId,
    messagingAccountId: graphId.optional(),
    phoneNumberId: graphId,
    appSecret: secret.max(256),
    accessToken: secret,
  })
  .strict();
export function pageLimit(
  value: string | null,
  fallback: number,
  maximum: number,
): number {
  if (value === null) return fallback;
  if (!/^\d{1,3}$/.test(value) || Number(value) < 1 || Number(value) > maximum)
    throw new AccessError("分頁大小不正確。", 400);
  return Number(value);
}
