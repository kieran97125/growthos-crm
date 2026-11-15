import "server-only";
import { createHash, hkdfSync } from "node:crypto";
import { z } from "zod";
import { database, requireCompany } from "@/lib/saas/server";
import { AccessError } from "@/lib/saas/identity";
import { assertBrand } from "@/lib/saas/member-scope";
import { requireProduct } from "@/lib/saas/products";
import { decryptCredentials, readMasterKey } from "@/lib/whatsapp/crypto";
import { graphId, channelSchema } from "@/lib/meta/protocol";
import { MetaGraphError } from "@/lib/meta/graph";
import {
  socialCommentAction,
  safeSocialPostUrl,
  type SocialCommentsPage,
} from "./model";
import { parseCommentEvents, type CommentEvent } from "./protocol";
import {
  inspectCommentPost,
  inspectPrivateReplySource,
  sendCommentPrivateReply,
  listCommentPosts,
  type SocialConnection,
} from "./provider";

function checked(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (/access_denied|product_required|brand_scope/.test(error.message ?? ""))
    throw new AccessError("你無權操作此品牌嘅留言規則。", 403);
  if (error.code === "P0002")
    throw new AccessError("找不到此規則或發送紀錄。", 404);
  if (/revision|identity_changed|idempotency/.test(error.message ?? ""))
    throw new AccessError("資料已更新，請重新讀取；草稿會保留。", 409);
  if (/social_post_unverified/.test(error.message ?? ""))
    throw new AccessError("請先完成貼文及渠道權限核實，規則未有啟用。", 409);
  if (/social_retry_unavailable/.test(error.message ?? ""))
    throw new AccessError(
      "此結果不能重發。請先核對平台紀錄，避免重複聯絡。",
      409,
    );
  if (/social_capacity/.test(error.message ?? ""))
    throw new AccessError("此公司已達留言規則上限，請先整理現有規則。", 409);
  if (/social_invalid/.test(error.message ?? ""))
    throw new AccessError("留言規則資料未通過驗證。", 400);
  throw new AccessError("留言私訊暫時未能完成操作，請稍後再試。", 503);
}
function config() {
  const appId = process.env.SMARTVOLT_META_APP_ID,
    appSecret = process.env.SMARTVOLT_META_APP_SECRET;
  if (
    !graphId.safeParse(appId).success ||
    !appSecret ||
    appSecret.length < 20 ||
    /\s/.test(appSecret)
  )
    throw new AccessError("Meta 應用程式尚未啟用。", 503);
  return { appId: appId!, appSecret };
}
function connectionToken(connection: SocialConnection) {
  const key = Buffer.from(
    hkdfSync("sha256", readMasterKey(), "convelta-meta", "credentials-v1", 32),
  );
  return z
    .string()
    .min(20)
    .parse(
      decryptCredentials(
        connection.credentials,
        key,
        `meta:${connection.company_id}`,
        connection.id,
      ).token,
    );
}
async function access(companyId: string) {
  z.uuid().parse(companyId);
  const a = await requireCompany(companyId);
  requireProduct(a.products, "crm");
  return a;
}
export async function readSocialComments(
  companyId: string,
  query: { brandId?: string; before?: string } = {},
): Promise<SocialCommentsPage> {
  const a = await access(companyId),
    brand = query.brandId
      ? z.string().min(1).max(100).parse(query.brandId)
      : null;
  if (brand) assertBrand(a.memberScope, brand);
  if (query.before && !/^[1-9]\d{0,18}$/.test(query.before))
    throw new AccessError("分頁資料不正確。", 400);
  const r = await a.db.rpc("sv_social_comments_read", {
    p_company: companyId,
    p_actor: a.user.id,
    p_brand: brand,
    p_before: query.before ?? null,
  });
  checked(r.error);
  const page = r.data as SocialCommentsPage;
  return {
    ...page,
    scopeStamp: createHash("sha256")
      .update(
        JSON.stringify([
          a.user.id,
          a.actor.role,
          a.memberScope.brandIds,
          a.memberScope.productIds,
          a.products,
        ]),
      )
      .digest("hex"),
    rules: page.rules.map((rule) => ({
      ...rule,
      permalink: safeSocialPostUrl(rule.permalink),
    })),
    deliveries: page.deliveries.map((job) => ({
      ...job,
      permalink: safeSocialPostUrl(job.permalink),
    })),
  };
}
async function loadConnection(
  db: ReturnType<typeof database>,
  company: string,
  id: string,
) {
  const r = await db
    .from("sv_meta_connections")
    .select(
      "id,company_id,brand_id,app_id,channel,page_id,account_id,credentials,enabled",
    )
    .eq("company_id", company)
    .eq("id", id)
    .maybeSingle();
  checked(r.error);
  if (!r.data) throw new AccessError("找不到此品牌通訊連接。", 404);
  return {
    ...r.data,
    channel: channelSchema.parse(r.data.channel),
  } as SocialConnection;
}
export async function readSocialCommentPosts(
  companyId: string,
  connectionId: string,
  after?: string,
) {
  const a = await access(companyId);
  z.uuid().parse(connectionId);
  if (!["owner", "manager"].includes(a.actor.role))
    throw new AccessError("讀取貼文需要管理員權限。", 403);
  const c = await loadConnection(a.db, companyId, connectionId);
  assertBrand(a.memberScope, c.brand_id);
  if (!c.enabled || c.app_id !== config().appId)
    throw new AccessError("此渠道需要重新接駁。", 409);
  try {
    return await listCommentPosts(c, connectionToken(c), after);
  } catch (e) {
    throw new AccessError(
      e instanceof MetaGraphError
        ? `暫時未能讀取貼文（${e.code}）。`
        : "暫時未能讀取貼文，請核對渠道權限。",
      409,
    );
  }
}
export async function actSocialComments(companyId: string, input: unknown) {
  const a = await access(companyId),
    action = socialCommentAction.parse(input);
  if (!["owner", "manager"].includes(a.actor.role))
    throw new AccessError("設定留言規則需要管理員權限。", 403);
  const replay = await a.db.rpc("sv_social_comment_replay", {
    p_company: companyId,
    p_actor: a.user.id,
    p_kind: action.action,
    p_data: action,
  });
  checked(replay.error);
  if (replay.data) return { ...replay.data, replayed: true };
  let proof = null;
  if (action.action === "save" || action.action === "toggle") {
    let definition: {
      brandId: string;
      connectionId: string;
      postId: string;
      enabled: boolean;
    };
    if (action.action === "save") definition = action.definition;
    else {
      const r = await a.db
        .from("sv_social_comment_rules")
        .select("brand_id,connection_id,post_id")
        .eq("company_id", companyId)
        .eq("id", action.id)
        .maybeSingle();
      checked(r.error);
      if (!r.data) throw new AccessError("找不到此規則。", 404);
      definition = {
        brandId: r.data.brand_id,
        connectionId: r.data.connection_id,
        postId: r.data.post_id,
        enabled: action.enabled,
      };
    }
    assertBrand(a.memberScope, definition.brandId);
    if (definition.enabled) {
      const connection = await loadConnection(
        a.db,
        companyId,
        definition.connectionId,
      );
      if (connection.brand_id !== definition.brandId)
        throw new AccessError("通訊連接不屬於此品牌。", 403);
      try {
        proof = await inspectCommentPost(
          config(),
          connection,
          definition.postId,
          connectionToken(connection),
          fetch,
          AbortSignal.timeout(25000),
        );
      } catch (e) {
        throw new AccessError(
          e instanceof MetaGraphError
            ? `未能啟用：貼文或留言私訊權限未通過核實（${e.code}）。`
            : e instanceof AccessError
              ? e.message
              : "未能核實貼文，規則未有啟用。",
          e instanceof AccessError ? e.status : 409,
        );
      }
    }
  }
  const r = await a.db.rpc("sv_social_comment_action", {
    p_company: companyId,
    p_actor: a.user.id,
    p_kind: action.action,
    p_data: action,
    p_proof: proof,
  });
  checked(r.error);
  return r.data;
}

/** Call only after the existing Meta signature verification succeeds. */
export async function ingestSocialComments(
  input: unknown,
  appId: string,
  onAccepted?: (company: string) => void,
) {
  const events = parseCommentEvents(input),
    db = database(),
    groups = new Map<string, CommentEvent[]>();
  for (const event of events) {
    const key = `${event.channel}:${event.accountId}`;
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  for (const group of groups.values()) {
    const first = group[0],
      connection = await db
        .from("sv_meta_connections")
        .select("id,company_id")
        .eq("app_id", appId)
        .eq("channel", first.channel)
        .eq("account_id", first.accountId)
        .eq("enabled", true)
        .maybeSingle();
    checked(connection.error);
    if (!connection.data) continue;
    const result = await db.rpc("sv_social_comments_ingest", {
      p_connection: connection.data.id,
      p_events: group,
    });
    checked(result.error);
    // Also wake after deletion/edit, so an already queued task is stopped promptly.
    onAccepted?.(connection.data.company_id);
  }
}

type Claim = {
  id: string;
  token: string;
  connectionId: string;
  commentId: string;
  postId: string;
  peerId: string;
  body: string;
  commentBody: string;
};
/** Bounded private worker. Checking can retry reads; entering 'sending' admits
 * exactly one external attempt. Interrupted/ambiguous POSTs never auto-retry. */
export async function dispatchSocialComments(companyId: string) {
  z.uuid().parse(companyId);
  const db = database(),
    signal = AbortSignal.timeout(35000),
    started = Date.now();
  let accepted = 0,
    processed = 0;
  for (let i = 0; i < 2 && Date.now() - started < 22000; i++) {
    const claim = await db.rpc("sv_social_comments_claim", {
      p_company: companyId,
    });
    checked(claim.error);
    const job = claim.data as Claim | null;
    if (!job) break;
    let admitted = false;
    try {
      const connection = await loadConnection(db, companyId, job.connectionId),
        token = connectionToken(connection);
      await inspectCommentPost(
        config(),
        connection,
        job.postId,
        token,
        fetch,
        signal,
      );
      const evidence = await inspectPrivateReplySource(
        connection,
        job,
        token,
        fetch,
        signal,
      );
      signal.throwIfAborted();
      const admission = await db.rpc("sv_social_comment_admit", {
        p_company: companyId,
        p_job: job.id,
        p_token: job.token,
        p_evidence: evidence,
      });
      checked(admission.error);
      if (!admission.data) {
        processed++;
        continue;
      }
      admitted = true;
      const outcome = await sendCommentPrivateReply(
        connection,
        job.commentId,
        job.body,
        token,
        fetch,
        signal,
      );
      const finish = await db.rpc("sv_social_comment_finish", {
        p_company: companyId,
        p_job: job.id,
        p_token: job.token,
        p_state: outcome.state,
        p_provider: outcome.mid,
        p_peer: outcome.peer,
        p_reason: outcome.code,
      });
      checked(finish.error);
      if (outcome.state === "accepted") accepted++;
    } catch (e) {
      const code =
        e instanceof MetaGraphError
          ? e.code
          : e instanceof AccessError
            ? "connection_not_ready"
            : "source_check_pending";
      const state = admitted
        ? "uncertain"
        : ["provider_unreachable", "source_check_pending"].includes(code)
          ? "queued"
          : /identity|post_not_owned/.test(code)
            ? "skipped"
            : "failed";
      const finish = await db.rpc("sv_social_comment_finish", {
        p_company: companyId,
        p_job: job.id,
        p_token: job.token,
        p_state: state,
        p_reason: code,
      });
      checked(finish.error);
    }
    processed++;
  }
  return { processed, accepted };
}
