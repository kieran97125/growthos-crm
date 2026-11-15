import { createHash } from "node:crypto";
import { commentObjectId, normalizeComment } from "./model";
import { graphId, type MetaChannel } from "@/lib/meta/protocol";

export type CommentEvent = {
  channel: MetaChannel;
  accountId: string;
  commentId: string;
  postId: string | null;
  peerId: string | null;
  text: string;
  normalized: string;
  eventAt: number;
  createdAt: number | null;
  deleted: boolean;
  live: boolean;
  key: string;
};
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
function timestamp(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value * 1000
      : typeof value === "string" && /^\d{10}$/.test(value)
        ? Number(value) * 1000
        : typeof value === "string"
          ? Date.parse(value)
          : NaN;
  return Number.isSafeInteger(n) && n > 0 && n < 4102444800000 ? n : null;
}
/** Only subscribed, owned Page feed comments / IG comments. Mentions and Live
 * are deliberately not silently treated as ordinary seven-day post comments. */
export function parseCommentEvents(input: unknown): CommentEvent[] {
  const root = record(input);
  if (!["page", "instagram"].includes(String(root.object))) return [];
  const channel: MetaChannel =
    root.object === "instagram" ? "instagram" : "messenger";
  const events: CommentEvent[] = [];
  for (const item of list(root.entry).slice(0, 100)) {
    const entry = record(item);
    if (!graphId.safeParse(entry.id).success) continue;
    for (const raw of list(entry.changes).slice(0, 100)) {
      const change = record(raw),
        value = record(change.value);
      if (
        channel === "messenger"
          ? change.field !== "feed" || value.item !== "comment"
          : !["comments", "live_comments"].includes(String(change.field))
      )
        continue;
      const comment = channel === "messenger" ? value.comment_id : value.id;
      if (!commentObjectId.safeParse(comment).success) continue;
      const deleted =
        value.is_deleted === true ||
        ["remove", "delete", "hide"].includes(String(value.verb));
      if (
        channel === "messenger" &&
        !deleted &&
        !["add", "edited", "edit", "update"].includes(String(value.verb))
      )
        continue;
      const media = record(value.media),
        from = record(value.from),
        post = channel === "messenger" ? value.post_id : media.id,
        peer = from.id,
        text = channel === "messenger" ? value.message : value.text,
        at = timestamp(entry.time);
      if (
        !at ||
        (!deleted &&
          (!commentObjectId.safeParse(post).success ||
            !graphId.safeParse(peer).success ||
            typeof text !== "string" ||
            !text.trim() ||
            text.length > 10000 ||
            !text.isWellFormed()))
      )
        continue;
      if (peer === entry.id) continue;
      const source = {
        channel,
        accountId: String(entry.id),
        commentId: String(comment),
        postId: commentObjectId.safeParse(post).success ? String(post) : null,
        peerId: graphId.safeParse(peer).success ? String(peer) : null,
        text: typeof text === "string" ? text.slice(0, 10000) : "",
        normalized: normalizeComment(
          typeof text === "string" ? text.slice(0, 10000) : "",
        ),
        eventAt: at,
        createdAt: timestamp(value.created_time ?? value.timestamp),
        deleted,
        live:
          change.field === "live_comments" ||
          media.media_product_type === "LIVE",
      };
      events.push({
        ...source,
        key: createHash("sha256").update(JSON.stringify(source)).digest("hex"),
      });
      if (events.length >= 100) return events;
    }
  }
  return events;
}
