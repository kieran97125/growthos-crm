import type { WaIdentity, WaProviderFailure, WaSendResult } from "./types";

export const DEFAULT_GRAPH_VERSION = "v27.0";
export const GRAPH_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 65_536;
const providerId = (value: unknown): value is string =>
  typeof value === "string" && /^[1-9]\d{0,49}$/.test(value);
const safeString = (value: unknown, max: number): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= max &&
  !/[\u0000-\u001f\u007f]/.test(value);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const failure = (
  code: WaProviderFailure["code"],
  disposition: WaProviderFailure["disposition"],
  httpStatus?: number,
  providerCode?: number,
): WaProviderFailure => ({
  ok: false,
  code,
  disposition,
  ...(httpStatus !== undefined ? { httpStatus } : {}),
  ...(providerCode !== undefined ? { providerCode } : {}),
});

export type GraphCredentials = {
  phoneNumberId: string;
  accessToken: string;
  version?: string;
};
export type SendTextInput = GraphCredentials & {
  to: WaIdentity;
  text: string;
  replyToProviderId?: string;
  /** Our send UUID only. Meta returns it in subsequent status webhooks. */
  opaqueCallbackData?: string;
  messagingAccountId?: string;
};
export type TextPayload = {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  type: "text";
  text: { body: string; preview_url: false };
  to?: string;
  recipient?: string;
  context?: { message_id: string };
  biz_opaque_callback_data?: string;
  messaging_account_id?: string;
};

function version(input: GraphCredentials): string | null {
  const selected = input.version ?? DEFAULT_GRAPH_VERSION;
  return /^v[1-9]\d{0,2}\.\d{1,2}$/.test(selected) ? selected : null;
}
function validCredentials(input: GraphCredentials): boolean {
  return (
    providerId(input.phoneNumberId) &&
    safeString(input.accessToken, 8192) &&
    !/\s/.test(input.accessToken) &&
    version(input) !== null
  );
}

/** Fixed provider host; caller input can never select another URL or redirect target. */
function graphUrl(input: GraphCredentials, edge = ""): string {
  return `https://graph.facebook.com/${version(input)}/${input.phoneNumberId}${edge}`;
}

export function buildTextPayload(input: SendTextInput): TextPayload | null {
  if (
    !validCredentials(input) ||
    typeof input.text !== "string" ||
    !input.text.trim() ||
    !input.text.isWellFormed() ||
    Array.from(input.text).length > 4096
  )
    return null;
  if (
    input.replyToProviderId !== undefined &&
    !safeString(input.replyToProviderId, 512)
  )
    return null;
  if (
    input.messagingAccountId !== undefined &&
    !providerId(input.messagingAccountId)
  )
    return null;
  if (
    input.opaqueCallbackData !== undefined &&
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      input.opaqueCallbackData,
    )
  )
    return null;
  const recipient = input.to;
  if (!recipient || !safeString(recipient.id, 160)) return null;
  const payload: TextPayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    type: "text",
    text: { body: input.text, preview_url: false },
  };
  if (recipient.kind === "phone") {
    if (
      !/^[1-9]\d{6,14}$/.test(recipient.id) ||
      (recipient.phone !== null && recipient.phone !== recipient.id)
    )
      return null;
    payload.to = recipient.id;
  } else if (recipient.kind === "bsuid") {
    if (/\s/.test(recipient.id)) return null;
    payload.recipient = recipient.id;
  } else return null;
  if (input.replyToProviderId)
    payload.context = { message_id: input.replyToProviderId };
  if (input.opaqueCallbackData)
    payload.biz_opaque_callback_data = input.opaqueCallbackData;
  if (input.messagingAccountId)
    payload.messaging_account_id = input.messagingAccountId;
  return payload;
}

async function readResponse(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > MAX_RESPONSE_BYTES
  ) {
    await response.body?.cancel();
    throw new Error("response_limit");
  }
  if (!response.body) throw new Error("empty_response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.length;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("response_limit");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
  );
}

function graphFailure(status: number, data: unknown): WaProviderFailure {
  const error = isRecord(data) && isRecord(data.error) ? data.error : null;
  const code =
    error &&
    typeof error.code === "number" &&
    Number.isSafeInteger(error.code) &&
    error.code >= 0
      ? error.code
      : undefined;
  if (status >= 500 || status === 408)
    return failure("provider_unavailable", "ambiguous", status, code);
  if (status === 429 || code === 130429 || code === 131048 || code === 131056)
    return failure("rate_limited", "definitive", status, code);
  if (
    status === 401 ||
    status === 403 ||
    code === 190 ||
    code === 10 ||
    code === 200
  )
    return failure("provider_auth", "definitive", status, code);
  if (code === 131047)
    return failure("window_closed", "definitive", status, code);
  if (code === 131026)
    return failure("invalid_recipient", "definitive", status, code);
  return failure("provider_rejected", "definitive", status, code);
}

type GraphReply = { response: Response; data: unknown } | WaProviderFailure;
async function request(
  input: GraphCredentials,
  init: RequestInit,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<GraphReply> {
  const controller = new AbortController();
  const timeout = Number.isFinite(timeoutMs)
    ? Math.max(1, Math.min(timeoutMs, GRAPH_TIMEOUT_MS))
    : GRAPH_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetchImpl(
      graphUrl(
        input,
        init.method === "POST"
          ? "/messages"
          : "?fields=id,display_phone_number,verified_name",
      ),
      {
        ...init,
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      },
    );
    let data: unknown;
    try {
      data = await readResponse(response);
    } catch {
      return response.ok
        ? failure("provider_response_invalid", "ambiguous", response.status)
        : graphFailure(response.status, null);
    }
    return { response, data };
  } catch {
    return failure("delivery_unknown", "ambiguous");
  } finally {
    clearTimeout(timer);
  }
}

/** One attempt only: an accepted request is not a delivery receipt. */
export async function sendText(
  input: SendTextInput,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = GRAPH_TIMEOUT_MS,
): Promise<WaSendResult> {
  const payload = buildTextPayload(input);
  if (!payload) return failure("invalid_request", "definitive");
  const reply = await request(
    input,
    { method: "POST", body: JSON.stringify(payload) },
    fetchImpl,
    timeoutMs,
  );
  if ("ok" in reply) return reply;
  const { response, data } = reply;
  if (!response.ok) return graphFailure(response.status, data);
  if (!isRecord(data))
    return failure("provider_response_invalid", "ambiguous", response.status);
  const first =
    Array.isArray(data.messages) && isRecord(data.messages[0])
      ? data.messages[0]
      : null;
  if (data.error)
    return first?.id
      ? failure("provider_response_invalid", "ambiguous", response.status)
      : graphFailure(response.status, data);
  if (!safeString(first?.id, 512))
    return failure("provider_response_invalid", "ambiguous", response.status);
  return { ok: true, providerId: first.id, accepted: true };
}

export type PhoneInspection =
  | {
      ok: true;
      phoneNumberId: string;
      displayPhoneNumber: string | null;
      verifiedName: string | null;
    }
  | WaProviderFailure;

/** Read-only token/phone reachability check. This does not prove send permission or webhook setup. */
export async function inspectPhoneNumber(
  input: GraphCredentials,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = GRAPH_TIMEOUT_MS,
): Promise<PhoneInspection> {
  if (!validCredentials(input)) return failure("invalid_request", "definitive");
  const reply = await request(input, { method: "GET" }, fetchImpl, timeoutMs);
  if ("ok" in reply) return reply;
  if (!reply.response.ok)
    return graphFailure(reply.response.status, reply.data);
  if (
    !isRecord(reply.data) ||
    reply.data.id !== input.phoneNumberId ||
    reply.data.error
  )
    return failure(
      "provider_response_invalid",
      "definitive",
      reply.response.status,
    );
  return {
    ok: true,
    phoneNumberId: input.phoneNumberId,
    displayPhoneNumber: safeString(reply.data.display_phone_number, 80)
      ? reply.data.display_phone_number
      : null,
    verifiedName: safeString(reply.data.verified_name, 160)
      ? reply.data.verified_name
      : null,
  };
}
