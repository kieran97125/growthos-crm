import { z } from "zod";
import { graphId, type MetaChannel } from "@/lib/meta/protocol";
import {
  metaGraphRequest,
  MetaGraphError,
  type GraphConfig,
} from "@/lib/meta/graph";
import { commentObjectId, safeSocialPostUrl } from "./model";

export type SocialConnection = {
  id: string;
  company_id: string;
  brand_id: string;
  app_id: string;
  channel: MetaChannel;
  page_id: string;
  account_id: string;
  credentials: unknown;
  enabled: boolean;
};
export type VerifiedPost = {
  verified: true;
  connectionId: string;
  accountId: string;
  postId: string;
  permalink: string | null;
};
export type SocialPostOption = {
  id: string;
  title: string;
  permalink: string | null;
  createdAt: string | null;
};
function safePermalink(value: unknown) {
  return safeSocialPostUrl(value);
}
export async function listCommentPosts(
  c: SocialConnection,
  token: string,
  after?: string,
  fetcher = fetch,
) {
  graphId.parse(c.page_id);
  graphId.parse(c.account_id);
  if (after && !/^[A-Za-z0-9_-]{1,512}$/.test(after))
    throw new MetaGraphError("invalid_cursor");
  const instagram = c.channel === "instagram";
  const result = await metaGraphRequest(
    `${instagram ? c.account_id : c.page_id}/${instagram ? "media" : "feed"}`,
    token,
    "GET",
    undefined,
    {
      fields: instagram
        ? "id,caption,timestamp,media_product_type,permalink"
        : "id,message,created_time,permalink_url,from{id}",
      limit: "25",
      ...(after ? { after } : {}),
    },
    fetcher,
  );
  const records = z
    .array(
      z.object({
        id: commentObjectId,
        caption: z.string().optional(),
        message: z.string().optional(),
        timestamp: z.string().optional(),
        created_time: z.string().optional(),
        media_product_type: z.string().optional(),
        permalink: z.string().optional(),
        permalink_url: z.string().optional(),
        from: z.object({ id: graphId }).optional(),
      }),
    )
    .parse(result.data);
  const posts: SocialPostOption[] = records
    .filter((p) =>
      instagram
        ? ["FEED", "REELS"].includes(p.media_product_type ?? "")
        : p.from?.id === c.page_id,
    )
    .map((p) => ({
      id: p.id,
      title:
        (p.caption ?? p.message ?? "")
          .replace(/\s+/gu, " ")
          .trim()
          .slice(0, 120) ||
        (p.media_product_type === "REELS" ? "Reel" : "未有文字嘅貼文"),
      permalink: safePermalink(p.permalink ?? p.permalink_url),
      createdAt: p.timestamp ?? p.created_time ?? null,
    }));
  const paging = result.paging as
    { next?: unknown; cursors?: { after?: unknown } } | undefined;
  const cursor =
    paging?.next &&
    typeof paging.cursors?.after === "string" &&
    /^[A-Za-z0-9_-]{1,512}$/.test(paging.cursors.after)
      ? paging.cursors.after
      : null;
  return { posts, nextCursor: cursor };
}
/** Verify the actual Page token, current application/permissions and exact
 * owned post, not a user-supplied URL or optimistic client readiness flag. */
export async function inspectCommentPost(
  config: GraphConfig,
  c: SocialConnection,
  postId: string,
  token: string,
  fetcher = fetch,
  signal?: AbortSignal,
): Promise<VerifiedPost> {
  graphId.parse(c.page_id);
  graphId.parse(c.account_id);
  commentObjectId.parse(postId);
  if (c.app_id !== config.appId || !c.enabled)
    throw new MetaGraphError("connection_disabled");
  const debug = await metaGraphRequest(
    "debug_token",
    `${config.appId}|${config.appSecret}`,
    "GET",
    undefined,
    { input_token: token },
    fetcher,
    signal,
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
    .safeParse(debug.data);
  if (!d.success || d.data.app_id !== config.appId)
    throw new MetaGraphError("token_app_mismatch");
  const permissions =
    c.channel === "instagram"
      ? [
          "pages_messaging",
          "instagram_manage_comments",
          "instagram_basic",
          "instagram_manage_messages",
          "pages_manage_metadata",
        ]
      : [
          "pages_messaging",
          "pages_read_engagement",
          "pages_read_user_content",
          "pages_manage_metadata",
        ];
  if (!permissions.every((p) => d.data.scopes.includes(p)))
    throw new MetaGraphError("comment_permission_missing");
  const now = Math.floor(Date.now() / 1000);
  if (
    [d.data.expires_at, d.data.data_access_expires_at].some(
      (t) => t && t < now + 60,
    )
  )
    throw new MetaGraphError("token_expired");
  const me = await metaGraphRequest(
    "me",
    token,
    "GET",
    undefined,
    { fields: "id" },
    fetcher,
    signal,
  );
  if (me.id !== c.page_id) throw new MetaGraphError("page_token_mismatch");
  const post = await metaGraphRequest(
    postId,
    token,
    "GET",
    undefined,
    {
      fields:
        c.channel === "instagram"
          ? "id,owner{id},media_product_type,permalink"
          : "id,from{id},permalink_url,is_published",
    },
    fetcher,
    signal,
  );
  if (post.id !== postId) throw new MetaGraphError("post_identity_mismatch");
  if (c.channel === "instagram") {
    const parsed = z
      .object({
        owner: z.object({ id: graphId }),
        media_product_type: z.string(),
      })
      .safeParse(post);
    if (
      !parsed.success ||
      parsed.data.owner.id !== c.account_id ||
      !["FEED", "REELS"].includes(parsed.data.media_product_type)
    )
      throw new MetaGraphError("post_not_owned_or_unsupported");
  } else {
    const parsed = z
      .object({
        from: z.object({ id: graphId }),
        is_published: z.boolean().optional(),
      })
      .safeParse(post);
    if (
      !parsed.success ||
      parsed.data.from.id !== c.page_id ||
      parsed.data.is_published === false
    )
      throw new MetaGraphError("post_not_owned_or_unsupported");
  }
  return {
    verified: true,
    connectionId: c.id,
    accountId: c.account_id,
    postId,
    permalink: safePermalink(post.permalink ?? post.permalink_url),
  };
}
export type CommentEvidence = {
  commentId: string;
  postId: string;
  accountId: string;
  peerId: string;
  text: string;
  createdAt: number;
  eligible: boolean;
};
export async function inspectPrivateReplySource(
  c: SocialConnection,
  job: { commentId: string; postId: string; peerId: string },
  token: string,
  fetcher = fetch,
  signal?: AbortSignal,
): Promise<CommentEvidence> {
  commentObjectId.parse(job.commentId);
  commentObjectId.parse(job.postId);
  graphId.parse(job.peerId);
  const source = await metaGraphRequest(
    job.commentId,
    token,
    "GET",
    undefined,
    {
      fields:
        c.channel === "instagram"
          ? "id,text,timestamp,media{id},from{id},hidden"
          : "id,message,created_time,from{id},parent{id},can_reply_privately,is_hidden",
    },
    fetcher,
    signal,
  );
  const date = source.timestamp ?? source.created_time;
  const createdAt = typeof date === "string" ? Date.parse(date) : NaN;
  const from = source.from as { id?: string } | undefined;
  const media = source.media as { id?: string } | undefined;
  const text = source.text ?? source.message;
  if (
    source.id !== job.commentId ||
    typeof text !== "string" ||
    !text.isWellFormed() ||
    !Number.isFinite(createdAt) ||
    !from ||
    from.id !== job.peerId ||
    (c.channel === "instagram" && media?.id !== job.postId)
  )
    throw new MetaGraphError("comment_identity_mismatch");
  return {
    commentId: job.commentId,
    postId: job.postId,
    accountId: c.account_id,
    peerId: job.peerId,
    text,
    createdAt,
    eligible:
      source.hidden !== true &&
      source.is_hidden !== true &&
      (c.channel !== "messenger" || source.can_reply_privately === true),
  };
}
/** Both current FB and IG private-reply docs use Page-ID/messages with
 * recipient.comment_id. A private reply never uses RESPONSE to claim that a
 * normal conversation window or marketing opt-in has already opened. */
export async function sendCommentPrivateReply(
  c: SocialConnection,
  commentId: string,
  text: string,
  token: string,
  fetcher = fetch,
  signal?: AbortSignal,
) {
  commentObjectId.parse(commentId);
  graphId.parse(c.page_id);
  if (!text.trim() || text.length > 1000 || !text.isWellFormed())
    throw new MetaGraphError("invalid_message");
  try {
    const response = await metaGraphRequest(
      `${c.page_id}/messages`,
      token,
      "POST",
      { recipient: { comment_id: commentId }, message: { text } },
      undefined,
      fetcher,
      signal,
    );
    const parsed = z
      .object({ message_id: z.string().min(1).max(512), recipient_id: graphId })
      .safeParse(response);
    return parsed.success
      ? {
          state: "accepted" as const,
          mid: parsed.data.message_id,
          peer: parsed.data.recipient_id,
          code: null,
        }
      : {
          state: "uncertain" as const,
          mid: null,
          peer: null,
          code: "provider_response_invalid",
        };
  } catch (e) {
    if (!(e instanceof MetaGraphError)) throw e;
    return {
      state: e.uncertain
        ? ("uncertain" as const)
        : ["activity_already_replied", "private_reply_unavailable"].includes(
              e.code,
            )
          ? ("skipped" as const)
          : ("failed" as const),
      mid: null,
      peer: null,
      code: e.code,
    };
  }
}
