import { z } from "zod";
import { graphId, type MetaChannel } from "./protocol";
export const GRAPH_VERSION = "v27.0";
export type GraphConfig = { appId: string; appSecret: string };
export class MetaGraphError extends Error {
  constructor(
    public code: string,
    public uncertain = false,
  ) {
    super(code);
  }
}
async function graph(
  path: string,
  token: string,
  method = "GET",
  body?: unknown,
  query?: Record<string, string>,
  fetcher = fetch,
): Promise<Record<string, unknown>> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
  try {
    const response = await fetcher(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const declared = response.headers.get("content-length");
    if (declared && Number(declared) > 65536)
      throw new MetaGraphError("provider_response_large", method !== "GET");
    const reader = response.body?.getReader();
    let raw = "";
    let size = 0;
    if (reader) {
      const decoder = new TextDecoder();
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 65536) {
            await reader.cancel();
            throw new MetaGraphError(
              "provider_response_large",
              method !== "GET",
            );
          }
          raw += decoder.decode(part.value, { stream: true });
        }
        raw += decoder.decode();
      } finally {
        reader.releaseLock();
      }
    }
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new MetaGraphError("provider_response_invalid", method !== "GET");
    }
    if (!response.ok || data.error) {
      const e = data.error as { code?: number } | undefined;
      throw new MetaGraphError(
        e?.code === 190
          ? "token_expired"
          : e?.code === 10 || e?.code === 200
            ? "permission_missing"
            : "provider_rejected",
        method !== "GET" && response.status >= 500,
      );
    }
    return data;
  } catch (error) {
    if (error instanceof MetaGraphError) throw error;
    throw new MetaGraphError("provider_unreachable", method !== "GET");
  }
}
export async function inspectPage(
  config: GraphConfig,
  pageId: string,
  channel: MetaChannel,
  token: string,
  fetcher = fetch,
) {
  graphId.parse(config.appId);
  graphId.parse(pageId);
  const debug = await graph(
    "debug_token",
    `${config.appId}|${config.appSecret}`,
    "GET",
    undefined,
    { input_token: token },
    fetcher,
  );
  const d = z
    .object({
      is_valid: z.literal(true),
      app_id: z.string(),
      type: z.literal("PAGE"),
      scopes: z.array(z.string()),
      expires_at: z.number().optional(),
      data_access_expires_at: z.number().optional(),
    })
    .parse(debug.data);
  if (d.app_id !== config.appId) throw new MetaGraphError("token_app_mismatch");
  const scopes =
    channel === "messenger"
      ? ["pages_messaging", "pages_manage_metadata"]
      : [
          "instagram_basic",
          "instagram_manage_messages",
          "pages_manage_metadata",
        ];
  if (!scopes.every((s) => d.scopes.includes(s)))
    throw new MetaGraphError("permission_missing");
  const now = Math.floor(Date.now() / 1000);
  if ([d.expires_at, d.data_access_expires_at].some((v) => v && v < now + 60))
    throw new MetaGraphError("token_expired");
  const me = await graph(
    "me",
    token,
    "GET",
    undefined,
    { fields: "id,name" },
    fetcher,
  );
  if (me.id !== pageId) throw new MetaGraphError("page_token_mismatch");
  let accountId = pageId,
    label = z.string().min(1).max(200).parse(me.name);
  if (channel === "instagram") {
    const page = await graph(
      pageId,
      token,
      "GET",
      undefined,
      { fields: "instagram_business_account{id,username}" },
      fetcher,
    );
    const ig = z
      .object({ id: graphId, username: z.string().max(200).optional() })
      .parse(page.instagram_business_account);
    accountId = ig.id;
    label = ig.username ?? label;
  }
  return { accountId, label, permissions: scopes };
}
export async function sendMetaText(
  accountId: string,
  channel: MetaChannel,
  peerId: string,
  body: string,
  token: string,
  fetcher = fetch,
): Promise<{
  state: "accepted" | "failed" | "uncertain";
  mid: string | null;
  code: string | null;
}> {
  graphId.parse(accountId);
  graphId.parse(peerId);
  if (
    !body.trim() ||
    !body.isWellFormed() ||
    Array.from(body).length > (channel === "instagram" ? 1000 : 2000)
  )
    throw new MetaGraphError("invalid_message");
  try {
    const result = await graph(
      `${accountId}/messages`,
      token,
      "POST",
      {
        recipient: { id: peerId },
        message: { text: body },
        ...(channel === "messenger" ? { messaging_type: "RESPONSE" } : {}),
      },
      undefined,
      fetcher,
    );
    const checked = z
      .object({ message_id: z.string().min(1).max(512), recipient_id: graphId })
      .safeParse(result);
    if (!checked.success || checked.data.recipient_id !== peerId)
      return {
        state: "uncertain",
        mid: null,
        code: "provider_response_invalid",
      };
    return { state: "accepted", mid: checked.data.message_id, code: null };
  } catch (e) {
    if (e instanceof MetaGraphError)
      return {
        state: e.uncertain ? "uncertain" : "failed",
        mid: null,
        code: e.code,
      };
    throw e;
  }
}
