/** Provider identities are not necessarily phone numbers: BSUIDs may have no phone. */
export type WaIdentity = {
  kind: "phone" | "bsuid";
  id: string;
  /** Country-qualified digits, without a leading +; null when Meta omits the phone. */
  phone: string | null;
  bsuid: string | null;
  parentBsuid: string | null;
};

export type WaInbound = {
  kind: "message";
  providerId: string;
  phoneNumberId: string;
  accountId: string;
  identity: WaIdentity;
  profileName: string;
  providerAt: number;
  messageType: string;
  body: string;
  replyToProviderId: string | null;
  /** Private attribution evidence; never serialize this or raw to an inbox client. */
  referral: Record<string, unknown> | null;
  raw: Record<string, unknown>;
};

export type WaReceiptStatus =
  "sent" | "delivered" | "read" | "failed" | "played";
export type WaStatus = {
  kind: "status";
  providerId: string;
  phoneNumberId: string;
  accountId: string;
  status: WaReceiptStatus;
  providerAt: number;
  recipient: WaIdentity | null;
  opaqueCallbackData: string | null;
  errorCode: number | null;
  raw: Record<string, unknown>;
};
export type WaEvent = WaInbound | WaStatus;
export type WaWebhookBatch = {
  events: WaEvent[];
  ignored: number;
  issues: { code: string; index: number }[];
};

export type WaProviderFailure = {
  ok: false;
  /** Ambiguous requests must not be automatically retried: Meta may have accepted them. */
  disposition: "definitive" | "ambiguous";
  code:
    | "invalid_request"
    | "provider_auth"
    | "window_closed"
    | "rate_limited"
    | "invalid_recipient"
    | "provider_rejected"
    | "provider_unavailable"
    | "provider_response_invalid"
    | "delivery_unknown";
  httpStatus?: number;
  providerCode?: number;
};
export type WaSendResult =
  { ok: true; providerId: string; accepted: true } | WaProviderFailure;

export class WaProtocolError extends Error {
  constructor(public readonly code: string) {
    // Codes only: provider text, credentials and raw customer payloads never enter errors.
    super(code);
    this.name = "WaProtocolError";
  }
}
