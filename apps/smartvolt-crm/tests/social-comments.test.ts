import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { parseCommentEvents } from "../src/lib/social-comments/protocol";
import {
  commentMatches,
  normalizeComment,
  socialRuleDefinition,
  safeSocialPostUrl,
} from "../src/lib/social-comments/model";
import {
  inspectCommentPost,
  inspectPrivateReplySource,
  sendCommentPrivateReply,
  listCommentPosts,
  type SocialConnection,
} from "../src/lib/social-comments/provider";
const connection: SocialConnection = {
  id: randomUUID(),
  company_id: randomUUID(),
  brand_id: "main",
  app_id: "123",
  page_id: "456",
  account_id: "789",
  channel: "instagram",
  enabled: true,
  credentials: {},
};
const payload = (value: object, field = "comments") => ({
  object: "instagram",
  entry: [{ id: "789", time: 1794759000, changes: [{ field, value }] }],
});
const source = {
  id: "1001",
  text: "想了解 PRICE",
  from: { id: "2002" },
  media: { id: "3003", media_product_type: "REELS" },
};
test("comment events distinguish IG posts/Reels, delete tombstones, Live and untrusted mentions", () => {
  const [event] = parseCommentEvents(payload(source));
  assert.equal(event.channel, "instagram");
  assert.equal(event.postId, "3003");
  assert.equal(event.peerId, "2002");
  assert.equal(event.live, false);
  assert.equal(event.normalized, "想了解 price");
  assert.equal(event.createdAt, null);
  assert.equal(
    parseCommentEvents(payload(source, "live_comments"))[0].live,
    true,
  );
  assert.deepEqual(parseCommentEvents(payload(source, "mentions")), []);
  assert.equal(
    parseCommentEvents(payload({ id: "1001", is_deleted: true }))[0].deleted,
    true,
  );
  assert.deepEqual(
    parseCommentEvents(payload({ ...source, from: { id: "789" } })),
    [],
  );
  assert.deepEqual(
    parseCommentEvents(payload({ ...source, id: "../messages" })),
    [],
  );
});
test("FB Page feed comments retain composite IDs and ignore unrelated post/like events", () => {
  const fb = {
    object: "page",
    entry: [
      {
        id: "456",
        time: 1794759000,
        changes: [
          {
            field: "feed",
            value: {
              item: "comment",
              verb: "add",
              comment_id: "456_1001",
              post_id: "456_3003",
              from: { id: "2002" },
              message: "PRICE",
              created_time: 1794758999,
            },
          },
        ],
      },
    ],
  };
  assert.equal(parseCommentEvents(fb)[0].commentId, "456_1001");
  assert.equal(parseCommentEvents(fb)[0].createdAt, 1794758999000);
  assert.equal(
    parseCommentEvents(fb)[0].key,
    parseCommentEvents(JSON.parse(JSON.stringify(fb)))[0].key,
  );
  fb.entry[0].changes[0].value.item = "like";
  assert.deepEqual(parseCommentEvents(fb), []);
});
test("keyword matching uses normalized literal substrings, not regex or an AI call", () => {
  assert.equal(normalizeComment("  ＰＲＩＣＥ\n 想了解 "), "price 想了解");
  assert.ok(commentMatches("想了解 PRICE", ["price", "想了解"], "all"));
  assert.equal(commentMatches("price", ["price", "想了解"], "all"), false);
  assert.equal(commentMatches("cost", [], "any"), false);
  assert.equal(commentMatches("hello", [".*"], "any"), false);
  const d = {
    id: randomUUID(),
    revision: 0,
    connectionId: randomUUID(),
    brandId: "main",
    name: "Rule",
    postId: "123_456",
    keywords: ["ＰＲＩＣＥ", "price"],
    match: "any",
    body: "Hello",
    enabled: false,
  };
  assert.equal(socialRuleDefinition.safeParse(d).success, false);
  assert.equal(
    socialRuleDefinition.safeParse({
      ...d,
      keywords: ["price"],
      endpoint: "https://evil.example",
    }).success,
    false,
  );
});
test("post links allow only exact HTTPS social hosts without credentials, ports or tracking", () => {
  assert.equal(
    safeSocialPostUrl(
      "https://www.instagram.com/p/synthetic/?token=secret#private",
    ),
    "https://www.instagram.com/p/synthetic/",
  );
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,secret",
    "https://instagram.com.evil.example/p/",
    "https://user:pass@instagram.com/p/",
    "https://instagram.com:8443/p/",
    "http://facebook.com/post/",
  ])
    assert.equal(safeSocialPostUrl(value), null);
});
test("private replies use official Page/messages comment recipient and preserve uncertain results", async () => {
  for (const channel of ["instagram", "messenger"] as const) {
    const calls: { url: string; body: unknown }[] = [];
    const result = await sendCommentPrivateReply(
      { ...connection, channel },
      "1001",
      "Hello",
      "synthetic-token",
      async (input, init) => {
        calls.push({
          url: String(input),
          body: JSON.parse(String(init?.body)),
        });
        return Response.json({
          message_id: "mid.actual",
          recipient_id: "2002",
        });
      },
    );
    assert.equal(result.state, "accepted");
    assert.equal(result.peer, "2002");
    assert.equal(calls[0].url, "https://graph.facebook.com/v27.0/456/messages");
    assert.deepEqual(calls[0].body, {
      recipient: { comment_id: "1001" },
      message: { text: "Hello" },
    });
  }
  assert.equal(
    (
      await sendCommentPrivateReply(
        connection,
        "1001",
        "Hello",
        "synthetic-token",
        async () => {
          throw Error("timeout");
        },
      )
    ).state,
    "uncertain",
  );
  assert.equal(
    (
      await sendCommentPrivateReply(
        connection,
        "1001",
        "Hello",
        "synthetic-token",
        async () => Response.json({ error: { code: 10900 } }, { status: 400 }),
      )
    ).state,
    "skipped",
  );
  assert.equal(
    (
      await sendCommentPrivateReply(
        connection,
        "1001",
        "Hello",
        "synthetic-token",
        async () => Response.json({ error: { code: 200 } }, { status: 403 }),
      )
    ).state,
    "failed",
  );
  assert.equal(
    (
      await sendCommentPrivateReply(
        connection,
        "1001",
        "Hello",
        "synthetic-token",
        async () => Response.json({ id: "not-a-receipt" }),
      )
    ).state,
    "uncertain",
  );
});
test("post verification checks current app, token owner, comment permissions and exact media owner", async () => {
  let count = 0;
  const fetcher = async () =>
    Response.json(
      [
        {
          data: {
            is_valid: true,
            app_id: "123",
            type: "PAGE",
            scopes: [
              "pages_messaging",
              "instagram_manage_comments",
              "instagram_basic",
              "instagram_manage_messages",
              "pages_manage_metadata",
            ],
          },
        },
        { id: "456" },
        {
          id: "3003",
          owner: { id: "789" },
          media_product_type: "REELS",
          permalink: "https://www.instagram.com/reel/test/?tracking=private",
        },
      ][count++],
    );
  const verified = await inspectCommentPost(
    { appId: "123", appSecret: "synthetic" },
    connection,
    "3003",
    "token",
    fetcher,
  );
  assert.equal(verified.verified, true);
  assert.equal(verified.permalink, "https://www.instagram.com/reel/test/");
  await assert.rejects(
    inspectCommentPost(
      { appId: "999", appSecret: "synthetic" },
      connection,
      "3003",
      "token",
      fetcher,
    ),
    /connection_disabled/,
  );
  let own = 0;
  await assert.rejects(
    inspectCommentPost(
      { appId: "123", appSecret: "synthetic" },
      connection,
      "3003",
      "token",
      async () =>
        Response.json(
          [
            {
              data: {
                is_valid: true,
                app_id: "123",
                type: "PAGE",
                scopes: [
                  "pages_messaging",
                  "instagram_manage_comments",
                  "instagram_basic",
                  "instagram_manage_messages",
                  "pages_manage_metadata",
                ],
              },
            },
            { id: "456" },
            { id: "3003", owner: { id: "999" }, media_product_type: "REELS" },
          ][own++],
        ),
    ),
    /post_not_owned/,
  );
});
test("source admission requires exact comment author/media/text and creation evidence", async () => {
  const job = { commentId: "1001", postId: "3003", peerId: "2002" };
  const body = {
    id: "1001",
    from: { id: "2002" },
    media: { id: "3003" },
    text: "Hello",
    timestamp: "2026-11-15T16:00:00+0000",
    hidden: false,
  };
  const evidence = await inspectPrivateReplySource(
    connection,
    job,
    "token",
    async () => Response.json(body),
  );
  assert.equal(evidence.eligible, true);
  assert.equal(evidence.createdAt, Date.parse(body.timestamp));
  await assert.rejects(
    inspectPrivateReplySource(connection, job, "token", async () =>
      Response.json({ ...body, media: { id: "999" } }),
    ),
    /comment_identity_mismatch/,
  );
  const fb = await inspectPrivateReplySource(
    { ...connection, channel: "messenger" },
    job,
    "token",
    async () =>
      Response.json({
        id: "1001",
        from: { id: "2002" },
        message: "Hello",
        created_time: body.timestamp,
        can_reply_privately: false,
      }),
  );
  assert.equal(fb.eligible, false);
});
test("post lists filter non-owned content, exclude Live and never expose provider paging URLs", async () => {
  const result = await listCommentPosts(
    connection,
    "token",
    undefined,
    async () =>
      Response.json({
        data: [
          {
            id: "3003",
            caption: "New post",
            media_product_type: "REELS",
            permalink: "https://www.instagram.com/reel/post/?token=secret",
          },
          { id: "3004", media_product_type: "LIVE" },
        ],
        paging: {
          next: "https://graph.facebook.com/?access_token=secret",
          cursors: { after: "safe_cursor" },
        },
      }),
  );
  assert.equal(result.posts.length, 1);
  assert.equal(
    result.posts[0].permalink,
    "https://www.instagram.com/reel/post/",
  );
  assert.equal(result.nextCursor, "safe_cursor");
  assert.equal(JSON.stringify(result).includes("secret"), false);
});
