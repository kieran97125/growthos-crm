import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
export const channelSchema = z.enum(["messenger", "instagram"]);
export type MetaChannel = z.infer<typeof channelSchema>;
export const graphId = z.string().regex(/^[1-9]\d{1,49}$/);
const remoteId = z.string().min(1).max(512);
const obj = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : {};
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | null => (typeof x === "string" ? x : null);
export type MetaEvent = {
  channel: MetaChannel;
  accountId: string;
  peerId: string;
  key: string;
  kind: "inbound" | "echo" | "delivered" | "read" | "referral";
  mid: string | null;
  at: number;
  body: string;
  referral: Record<string, unknown> | null;
  raw: Record<string, unknown>;
};
export function signatureValid(
  raw: Uint8Array,
  signature: string | null,
  secret: string,
): boolean {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature))
    return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"));
}
export function parseEvents(payload: unknown, now = Date.now()): MetaEvent[] {
  const p = obj(payload);
  const channel =
    p.object === "page"
      ? "messenger"
      : p.object === "instagram"
        ? "instagram"
        : null;
  if (!channel || !Array.isArray(p.entry) || p.entry.length > 100)
    throw new Error("invalid_meta_envelope");
  const out: MetaEvent[] = [];
  for (const rawEntry of p.entry) {
    const entry = obj(rawEntry);
    const accountId = graphId.parse(entry.id);
    for (const rawEvent of arr(entry.messaging)) {
      if (out.length >= 500) throw new Error("meta_event_limit");
      const e = obj(rawEvent),
        sender = graphId.parse(obj(e.sender).id),
        recipient = graphId.parse(obj(e.recipient).id);
      const at = Number(e.timestamp);
      if (!Number.isSafeInteger(at) || at < 1 || at > now + 300000)
        throw new Error("invalid_meta_time");
      const message = obj(e.message),
        echo = message.is_echo === true;
      if ((echo && sender !== accountId) || (!echo && recipient !== accountId))
        throw new Error("meta_account_mismatch");
      const peerId = echo ? recipient : sender;
      if (peerId === accountId) continue;
      const common: Omit<MetaEvent, "kind" | "mid" | "body" | "key"> = {
        channel,
        accountId,
        peerId,
        at,
        referral: Object.keys(obj(e.referral)).length
          ? obj(e.referral)
          : Object.keys(obj(message.referral)).length
            ? obj(message.referral)
            : null,
        raw: e,
      };
      if (Object.keys(message).length) {
        const mid = remoteId.parse(message.mid);
        const text = str(message.text);
        if (text !== null && (text.length > 20000 || !text.isWellFormed()))
          throw new Error("invalid_meta_body");
        out.push({
          ...common,
          kind: echo ? "echo" : "inbound",
          mid,
          body: text ?? "[附件／分享內容：請於原生平台查看]",
          key: createHash("sha256")
            .update(JSON.stringify([channel, accountId, "message", mid]))
            .digest("hex"),
        });
      } else if (Object.keys(obj(e.postback)).length) {
        const post = obj(e.postback);
        const title = (str(post.title) ?? "[客戶選擇]").slice(0, 2000);
        out.push({
          ...common,
          kind: "inbound",
          mid: str(post.mid),
          body: title,
          key: createHash("sha256")
            .update(
              JSON.stringify([
                channel,
                accountId,
                peerId,
                "postback",
                at,
                post,
              ]),
            )
            .digest("hex"),
        });
      } else if (Object.keys(obj(e.referral)).length) {
        out.push({
          ...common,
          kind: "referral",
          mid: null,
          body: "",
          key: createHash("sha256")
            .update(
              JSON.stringify([
                channel,
                accountId,
                peerId,
                "referral",
                at,
                e.referral,
              ]),
            )
            .digest("hex"),
        });
      } else if (
        Object.keys(obj(e.delivery)).length ||
        Object.keys(obj(e.read)).length
      ) {
        const kind = Object.keys(obj(e.read)).length ? "read" : "delivered";
        const receipt = obj(kind === "read" ? e.read : e.delivery);
        const ids = arr(receipt.mids).map((x) => remoteId.parse(x));
        // Keep watermark evidence, but only advance receipts with explicit message IDs.
        for (const mid of ids.length ? ids : [null])
          out.push({
            ...common,
            kind,
            mid,
            body: "",
            key: createHash("sha256")
              .update(
                JSON.stringify([
                  channel,
                  accountId,
                  peerId,
                  kind,
                  mid,
                  receipt,
                ]),
              )
              .digest("hex"),
          });
      }
    }
  }
  return out;
}
