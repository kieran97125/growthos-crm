import { createHash } from "node:crypto";
import { boundedProviderJson } from "@/lib/engagement/templates";
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
type Fetcher = typeof fetch;
export async function verifyDestination(
  {
    datasetId,
    businessId,
    adAccountId,
    token,
  }: {
    datasetId: string;
    businessId: string;
    adAccountId: string;
    token: string;
  },
  fetcher: Fetcher = fetch,
) {
  if (
    ![datasetId, businessId, adAccountId].every((x) =>
      /^[1-9][0-9]{1,39}$/.test(x),
    ) ||
    !token ||
    /[\s\u0000-\u001f]/.test(token)
  )
    throw Error("invalid_destination");
  async function read(path: string, fields: string) {
    const u = new URL("https://graph.facebook.com/v27.0/" + path);
    u.searchParams.set("fields", fields);
    const r = await fetcher(u, {
      headers: { Authorization: "Bearer " + token },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const d = (await boundedProviderJson(r)) as Record<string, unknown>;
    if (!r.ok || d.error) throw Error("destination_not_verified");
    return d;
  }
  const [pixel, account] = await Promise.all([
    read(datasetId, "id,name,owner_business{id},owner_ad_account{id}"),
    read("act_" + adAccountId, "id,business{id}"),
  ]);
  if (
    pixel.id !== datasetId ||
    (pixel.owner_business as { id?: string } | undefined)?.id !== businessId ||
    (account.business as { id?: string } | undefined)?.id !== businessId ||
    account.id !== "act_" + adAccountId
  )
    throw Error("destination_owner_mismatch");
  return {
    label:
      typeof pixel.name === "string" ? pixel.name.slice(0, 160) : datasetId,
  };
}
export type AdmittedFeedback = {
  eventId: string;
  eventName: "Schedule" | "Purchase";
  eventTime: number;
  amountCents: number | null;
  currency: string;
  phone: string;
  email: string;
  customerId: string;
  brandId: string;
};
export function buildFeedbackEvent(
  company: string,
  a: AdmittedFeedback,
  now = Date.now(),
) {
  if (
    !/^[a-f0-9]{64}$/.test(a.eventId) ||
    !["Schedule", "Purchase"].includes(a.eventName) ||
    !Number.isSafeInteger(a.eventTime) ||
    a.eventTime > Math.floor(now / 1000) ||
    a.eventTime <= Math.floor(now / 1000) - 7 * 86400
  )
    throw Error("source_expired");
  const user_data: Record<string, string[]> = {
    external_id: [hash(JSON.stringify([company, a.brandId, a.customerId]))],
  };
  if (/^\+[1-9][0-9]{6,14}$/.test(a.phone))
    user_data.ph = [hash(a.phone.slice(1))];
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email))
    user_data.em = [hash(a.email.trim().toLowerCase())];
  if (!user_data.ph && !user_data.em) throw Error("matching_data_missing");
  if (
    a.eventName === "Purchase" &&
    (!Number.isSafeInteger(a.amountCents) ||
      a.amountCents! <= 0 ||
      a.currency !== "HKD")
  )
    throw Error("payment_invalid");
  // Manual operational records do not prove the channel where a conversion occurred.
  return {
    event_name: a.eventName,
    event_id: a.eventId,
    event_time: a.eventTime,
    action_source: "other",
    user_data,
    ...(a.eventName === "Purchase"
      ? { custom_data: { value: a.amountCents! / 100, currency: a.currency } }
      : {}),
  };
}
export async function postFeedback(
  dataset: string,
  token: string,
  event: ReturnType<typeof buildFeedbackEvent>,
  testCode: string | null,
  fetcher: Fetcher = fetch,
): Promise<{
  state: "accepted" | "failed" | "unknown";
  reason: string | null;
  receipt: Record<string, unknown>;
}> {
  if (!/^[1-9][0-9]{1,39}$/.test(dataset) || !token)
    return { state: "failed", reason: "destination_invalid", receipt: {} };
  try {
    const r = await fetcher(
        `https://graph.facebook.com/v27.0/${dataset}/events`,
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            data: [event],
            partner_agent: "convelta",
            ...(testCode ? { test_event_code: testCode } : {}),
          }),
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        },
      ),
      d = (await boundedProviderJson(r)) as {
        events_received?: number;
        fbtrace_id?: string;
        error?: { code?: number };
      };
    if (r.ok && d.events_received === 1 && !d.error)
      return {
        state: "accepted",
        reason: null,
        receipt: {
          eventsReceived: 1,
          ...(typeof d.fbtrace_id === "string"
            ? { traceId: d.fbtrace_id.slice(0, 200) }
            : {}),
        },
      };
    return {
      state: r.status >= 500 || r.ok ? "unknown" : "failed",
      reason: d.error?.code
        ? "meta_" + d.error.code
        : "provider_result_unconfirmed",
      receipt: { httpStatus: r.status },
    };
  } catch {
    return { state: "unknown", reason: "provider_result_unknown", receipt: {} };
  }
}
