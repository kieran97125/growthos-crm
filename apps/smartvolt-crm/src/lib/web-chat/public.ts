import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { database } from "@/lib/saas/database";
import { AccessError } from "@/lib/saas/identity";
import { boundedJson } from "@/lib/whatsapp/http";
import { publicChatAction, publicChatId, normalizeChatOrigin } from "./model";
import { chatFailure } from "./server";

function requestBoundary(request: NextRequest) {
  const expected = new URL(
    process.env.SMARTVOLT_APP_URL || request.nextUrl.origin,
  ).origin;
  const origin = request.headers.get("origin");
  if (
    (origin && origin !== expected) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new AccessError("請由網站聊天窗操作。", 403);
}
function hashToken(request: NextRequest, id: string) {
  const header = request.headers.get("authorization") ?? "";
  if (!/^Bearer [A-Za-z0-9_-]{43}$/.test(header))
    throw new AccessError("請重新開始對話。", 401);
  return createHash("sha256")
    .update(id + ":" + header.slice(7))
    .digest("hex");
}
export async function publicConfig(id: string, site: string) {
  publicChatId.parse(id);
  const origin = normalizeChatOrigin(site),
    r = await database().rpc("sv_web_chat_public_config", {
      p_id: id,
      p_origin: origin,
    });
  chatFailure(r.error);
  return r.data as {
    id: string;
    name: string;
    greeting: string;
    origin: string;
  };
}
export async function visitorGet(request: NextRequest, id: string) {
  requestBoundary(request);
  publicChatId.parse(id);
  const q = z
    .object({
      threadId: z.uuid(),
      origin: z.string().max(260),
      after: z.coerce
        .number()
        .int()
        .min(0)
        .max(Number.MAX_SAFE_INTEGER)
        .default(0),
    })
    .strict()
    .parse(Object.fromEntries(request.nextUrl.searchParams));
  const r = await database().rpc("sv_web_chat_visitor_read", {
    p_id: id,
    p_origin: normalizeChatOrigin(q.origin),
    p_thread: q.threadId,
    p_hash: hashToken(request, id),
    p_after: q.after,
  });
  chatFailure(r.error);
  return r.data;
}
export async function visitorPost(request: NextRequest, id: string) {
  requestBoundary(request);
  publicChatId.parse(id);
  const data = publicChatAction.parse(await boundedJson(request)),
    hash = hashToken(request, id);
  if (data.action === "start") {
    const ip = (
      request.headers.get("x-vercel-forwarded-for") ??
      request.headers.get("x-real-ip") ??
      "unknown"
    )
      .split(",")[0]
      .trim()
      .slice(0, 100);
    const rate = createHash("sha256")
      .update(id + ":" + ip)
      .digest("hex");
    const r = await database().rpc("sv_web_chat_start", {
      p_id: id,
      p_origin: data.origin,
      p_thread: data.threadId,
      p_hash: hash,
      p_name: data.name,
      p_rate: rate,
    });
    chatFailure(r.error);
    return r.data;
  }
  const r = await database().rpc("sv_web_chat_visitor_send", {
    p_id: id,
    p_origin: data.origin,
    p_thread: data.threadId,
    p_hash: hash,
    p_command: data.commandId,
    p_body: data.body,
  });
  chatFailure(r.error);
  return r.data;
}
