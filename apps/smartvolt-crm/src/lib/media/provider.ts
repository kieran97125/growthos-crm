import { z } from "zod";
import {
  buildTextPayload,
  DEFAULT_GRAPH_VERSION,
  type TextPayload,
} from "@/lib/whatsapp/graph";
import type { WaIdentity } from "@/lib/whatsapp/types";
import { boundedMedia } from "./bytes";
import type { MediaKind } from "./model";
export type MediaOutcome = {
  state: "accepted" | "failed" | "unknown";
  providerId: string | null;
  errorCode: string | null;
};
type AttachmentBody = { link: string; caption?: string; filename?: string };
export type WhatsAppMediaPayload = Omit<TextPayload, "type" | "text"> & {
  type: MediaKind;
} & Partial<Record<MediaKind, AttachmentBody>>;
function link(raw: string) {
  const u = new URL(raw);
  if (u.protocol !== "https:" || u.username || u.password || u.hash || u.port)
    throw Error("media_link_invalid");
  return u.toString();
}
export function whatsappMediaPayload(o: {
  phoneNumberId: string;
  token: string;
  to: WaIdentity;
  kind: MediaKind;
  url: string;
  filename: string;
  caption: string;
  clientId: string;
  messagingAccountId?: string;
  version?: string;
}): WhatsAppMediaPayload {
  const base = buildTextPayload({
    phoneNumberId: o.phoneNumberId,
    accessToken: o.token,
    to: o.to,
    text: "attachment",
    opaqueCallbackData: o.clientId,
    version: o.version,
    messagingAccountId: o.messagingAccountId,
  });
  if (!base) throw Error("media_request_invalid");
  const rest: Omit<TextPayload, "type" | "text"> = {
    messaging_product: base.messaging_product,
    recipient_type: base.recipient_type,
    ...(base.to ? { to: base.to } : {}),
    ...(base.recipient ? { recipient: base.recipient } : {}),
    ...(base.context ? { context: base.context } : {}),
    ...(base.biz_opaque_callback_data
      ? { biz_opaque_callback_data: base.biz_opaque_callback_data }
      : {}),
    ...(base.messaging_account_id
      ? { messaging_account_id: base.messaging_account_id }
      : {}),
  };
  return {
    ...rest,
    type: o.kind,
    [o.kind]: {
      link: link(o.url),
      ...(o.kind !== "audio" && o.caption ? { caption: o.caption } : {}),
      ...(o.kind === "document" ? { filename: o.filename } : {}),
    },
  };
}
export function metaMediaPayload(o: {
  accountId: string;
  peerId: string;
  channel: "messenger" | "instagram";
  kind: MediaKind;
  url: string;
}) {
  z.string()
    .regex(/^[1-9]\d{0,49}$/)
    .parse(o.accountId);
  z.string()
    .regex(/^[1-9]\d{0,49}$/)
    .parse(o.peerId);
  return {
    recipient: { id: o.peerId },
    message: {
      attachment: {
        type: o.kind === "document" ? "file" : o.kind,
        payload: { url: link(o.url) },
      },
    },
    ...(o.channel === "messenger" ? { messaging_type: "RESPONSE" } : {}),
  };
}
export async function dispatchMedia(
  o: {
    source: "whatsapp" | "meta";
    accountId: string;
    token: string;
    payload: unknown;
    version?: string;
    peerId?: string;
  },
  fetcher: typeof fetch = fetch,
): Promise<MediaOutcome> {
  if (!/^[1-9]\d{0,49}$/.test(o.accountId) || !/^\S{16,8192}$/.test(o.token))
    return { state: "failed", providerId: null, errorCode: "invalid_request" };
  const version = o.version ?? DEFAULT_GRAPH_VERSION;
  if (!/^v[1-9]\d{0,2}\.\d{1,2}$/.test(version))
    return { state: "failed", providerId: null, errorCode: "invalid_request" };
  try {
    const response = await fetcher(
      `https://graph.facebook.com/${version}/${o.accountId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + o.token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(o.payload),
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      },
    );
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          await boundedMedia(
            response.ok
              ? response
              : new Response(response.body, { headers: response.headers }),
            65536,
          ),
        ),
      );
    } catch {
      return {
        state:
          response.status >= 400 && response.status < 500
            ? "failed"
            : "unknown",
        providerId: null,
        errorCode: "provider_response_invalid",
      };
    }
    if (!response.ok || data.error) {
      const code = Number((data.error as { code?: number } | undefined)?.code);
      return {
        state:
          response.status >= 500 || response.status === 408
            ? "unknown"
            : "failed",
        providerId: null,
        errorCode:
          code === 190 || code === 10 || code === 200
            ? "provider_auth"
            : code === 131047
              ? "window_closed"
              : response.status === 429
                ? "rate_limited"
                : "provider_rejected",
      };
    }
    const id =
      o.source === "whatsapp"
        ? (data.messages as { id?: unknown }[] | undefined)?.[0]?.id
        : data.message_id;
    if (
      typeof id !== "string" ||
      !id ||
      id.length > 512 ||
      (o.source === "meta" && data.recipient_id !== o.peerId)
    )
      return {
        state: "unknown",
        providerId: null,
        errorCode: "provider_response_invalid",
      };
    return { state: "accepted", providerId: id, errorCode: null };
  } catch {
    return {
      state: "unknown",
      providerId: null,
      errorCode: "provider_unreachable",
    };
  }
}
