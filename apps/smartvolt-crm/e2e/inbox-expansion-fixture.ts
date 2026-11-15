import type { Page, Route } from "@playwright/test";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { BRAND_CSS } from "../src/lib/brand";
import type {
  InboxPage,
  Inquiry,
  InquiryDetail,
} from "../src/lib/inquiries/model";
import { createEditorFixture } from "./support/editor";
import type {
  WebChatConversation,
  WebChatPage,
  WebChatThread,
} from "../src/lib/web-chat/model";
import type { MediaPage } from "../src/lib/media/model";

// Product Learning Sync checked: fresh canonical protocol/index/checkpoint and
// 07-17 regression, 08-10 permission scope and 10-06 progressive disclosure.
// These are isolated synthetic identities; no hosted company data is used.
export const company = "81111111-1111-4111-8111-111111111111";
export const actor = "8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const socialThread = "82222222-2222-4222-8222-222222222222";
export const websiteThread = "83333333-3333-4333-8333-333333333333";
export const secondWebsiteThread = "89999999-9999-4999-8999-999999999999";
export const customer = "84444444-4444-4444-8444-444444444444";
export const mediaMessage = "85555555-5555-4555-8555-555555555555";
export const fixturePath = "/__inbox_expansion_integration_fixture__";
const companyName = "Synthetic channel integration";
export type CapturedRequest = {
  path: string;
  method: string;
  query: URLSearchParams;
  body: Record<string, unknown> | null;
};

/** Follow the production layout's real imports, including all feature styles. */
function productionCss(path: string, stack = new Set<string>()): string {
  const full = resolve(path);
  if (stack.has(full)) throw Error("Circular fixture stylesheet import");
  stack.add(full);
  const css = readFileSync(full, "utf8").replace(
    /@import\s+["']([^"']+)["']\s*;/g,
    (_, source: string) =>
      productionCss(
        source.startsWith(".")
          ? resolve(dirname(full), source)
          : resolve("node_modules", source),
        new Set(stack),
      ),
  );
  return css;
}

export async function integrationBundle() {
  return (
    await build({
      stdin: {
        loader: "tsx",
        resolveDir: process.cwd(),
        contents: `
          import React from 'react';
          import {createRoot} from 'react-dom/client';
          import {CompanyWorkspaceChrome} from './src/components/workspace/CompanyWorkspace';
          import InboxChannels from './src/components/inquiries/InboxChannels';
          const url = new URL(location.href);
          createRoot(document.getElementById('fixture')).render(
            <CompanyWorkspaceChrome companyId='${company}' companyName='${companyName}' actorId='${actor}' actorName='Synthetic owner' products={['crm','pos']} location={{pathname:'/company/${company}/crm',search:url.search}}>
              <InboxChannels companyId='${company}' companyName='${companyName}' actorId='${actor}' hasPos={true} initialProvider={url.searchParams.get('provider') ?? undefined} initialThread={url.searchParams.get('thread') ?? undefined}/>
            </CompanyWorkspaceChrome>
          );`,
      },
      bundle: true,
      write: false,
      platform: "browser",
      format: "iife",
      loader: { ".css": "empty" },
      jsx: "automatic",
      define: {
        "process.env": JSON.stringify({
          NODE_ENV: "test",
          __NEXT_ROUTER_BASEPATH: "",
        }),
      },
    })
  ).outputFiles[0].text;
}

export async function mountIntegration(
  page: Page,
  bundle: string,
  options: {
    initialWebsite?: boolean;
    viewer?: boolean;
    windowClosed?: boolean;
    unresolved?: boolean;
    secondWebsite?: boolean;
    websiteHasOlder?: boolean;
    handler?: (request: CapturedRequest, route: Route) => Promise<boolean>;
  } = {},
) {
  const now = Date.now();
  const row: Inquiry = {
    key: "meta:" + socialThread,
    provider: "meta",
    channel: "messenger",
    id: socialThread,
    brand_id: "main",
    revision: 1,
    customer_id: customer,
    link_revision: 0,
    name: "Synthetic social customer",
    updated_at: new Date(now).toISOString(),
    unread_count: 1,
    preview: "想了解星期六安排",
    last_inbound_at: now - (options.windowClosed ? 86401000 : 1000),
    assignee_active: false,
    customer_name: "",
    assignee_id: null,
    priority: "normal",
    follow_up_at: null,
    next_step: "",
    status: "open",
  };
  const overview: InboxPage = {
    threads: [row],
    counts: {
      all: 1,
      mine: 0,
      unassigned: 1,
      overdue: 0,
      priority: 0,
      unread: 1,
      resolved: 0,
    },
    nextCursor: null,
    companyName,
    actorId: actor,
    canEdit: !options.viewer,
    hasPos: true,
    members: [{ user_id: actor, display_name: "Synthetic owner" }],
    brands: [{ id: "main", name: "Synthetic brand" }],
    connections: [
      {
        channel: "messenger",
        label: "Synthetic Page",
        state: "inbound-observed",
      },
    ],
  };
  const detail: InquiryDetail = {
    thread: row,
    customer: {
      id: customer,
      name: row.name,
      phone: "",
      email: "",
      tags: [],
      note: "",
      source: "messenger",
      brandIds: ["main"],
      revision: 1,
    },
    links: [{ provider: "meta", thread_id: socialThread, brand_id: "main" }],
    events: [],
    nextEvent: null,
    requests: [],
    hasMoreRequests: false,
    messages: [
      {
        id: mediaMessage,
        seq: 1,
        direction: "incoming",
        body: "[附件／分享內容]",
        state: "received",
        at: now - 1000,
        author: null,
        hasMedia: true,
      },
      ...(options.unresolved
        ? [
            {
              id: "86666666-6666-4666-8666-666666666666",
              seq: 2,
              direction: "outgoing" as const,
              body: "結果待核對嘅上一則回覆",
              state: "unknown",
              at: now,
              author: "Synthetic owner",
            },
          ]
        : []),
    ],
    nextBefore: null,
    activity: [],
  };
  const captures: CapturedRequest[] = [];
  const unexpected: string[] = [];
  const website: WebChatThread = {
    id: websiteThread,
    brandId: "main",
    brandName: "Synthetic brand",
    visitorName: "Synthetic website visitor",
    preview: "網站訪客想了解服務",
    lastMessageAt: new Date(now).toISOString(),
    unread: true,
    customerId: null,
    status: "open",
    revision: 1,
    site: "https://chat-fixture.example.com",
  };
  const websitePage: WebChatPage = {
    threads: [website],
    canReply: !options.viewer,
    nextCursor: null,
  };
  const websiteConversation: WebChatConversation = {
    thread: website,
    messages: [
      {
        id: "87777777-7777-4777-8777-777777777777",
        sequence: options.websiteHasOlder ? 2 : 1,
        body: "網站訪客想了解服務",
        direction: "incoming",
        actorName: null,
        createdAt: new Date(now).toISOString(),
      },
    ],
    canReply: !options.viewer,
    nextCursor: options.websiteHasOlder ? 2 : null,
  };
  const secondWebsite: WebChatThread = {
    ...website,
    id: secondWebsiteThread,
    visitorName: "Another website visitor",
    preview: "另一位訪客嘅私人查詢",
  };
  const secondWebsiteConversation: WebChatConversation = {
    thread: secondWebsite,
    messages: [
      {
        id: "8bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        sequence: 1,
        body: "另一位訪客嘅私人查詢",
        direction: "incoming",
        actorName: null,
        createdAt: new Date(now).toISOString(),
      },
    ],
    canReply: !options.viewer,
    nextCursor: null,
  };
  if (options.secondWebsite) websitePage.threads.push(secondWebsite);
  const editor = createEditorFixture();
  const vars = Object.entries(BRAND_CSS)
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
  const css =
    productionCss("src/app/globals.css") +
    "\n" +
    productionCss("src/app/saas.css");
  const html = `<!doctype html><html lang="zh-HK"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic inbox channel integration</title><style>:root{${vars}}${css}</style></head><body><div id="fixture"></div><script>${bundle.replaceAll("</script", "<\\/script")}</script></body></html>`;
  await page.route(`**${fixturePath}**`, (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    let body: Record<string, unknown> | null = null;
    if (req.method() !== "GET" && req.postData()) {
      try {
        body = req.postDataJSON() as Record<string, unknown>;
      } catch {}
    }
    const captured = {
      path: url.pathname,
      method: req.method(),
      query: url.searchParams,
      body,
    };
    captures.push(captured);
    if (options.handler && (await options.handler(captured, route))) return;
    if (url.pathname.endsWith("/web-chat/threads")) {
      if (req.method() === "GET") {
        await route.fulfill({
          json: url.searchParams.has("threadId")
            ? url.searchParams.get("threadId") === secondWebsiteThread
              ? secondWebsiteConversation
              : websiteConversation
            : websitePage,
        });
        return;
      }
      if (body?.action === "reply") {
        const conversation =
          body.threadId === secondWebsiteThread
            ? secondWebsiteConversation
            : websiteConversation;
        if (!conversation.messages.some((m) => m.id === body.commandId)) {
          conversation.messages.push({
            id: String(body.commandId),
            sequence: conversation.messages.length + 1,
            body: String(body.body),
            direction: "outgoing",
            actorName: "Synthetic owner",
            createdAt: new Date(now).toISOString(),
          });
          conversation.thread.revision++;
        }
        await route.fulfill({ json: { saved: true } });
        return;
      }
    }
    if (url.pathname.endsWith("/media") && req.method() === "GET") {
      const media: MediaPage = {
        items:
          url.searchParams.get("messageId") === mediaMessage
            ? [
                {
                  id: mediaMessage + ":0",
                  assetId: null,
                  messageId: mediaMessage,
                  index: 0,
                  kind: "image",
                  filename: "Synthetic reference.png",
                  mimeType: "image/png",
                  bytes: 1024,
                  available: true,
                },
              ]
            : [],
      };
      await route.fulfill({ json: media });
      return;
    }
    if (url.pathname.endsWith("/editor")) {
      await editor(route);
      return;
    }
    if (url.pathname.endsWith("/notifications")) {
      await route.fulfill({ json: { total: 0, notifications: [] } });
      return;
    }
    if (
      url.pathname.endsWith("/operations") &&
      url.searchParams.get("mode") === "attention"
    ) {
      await route.fulfill({
        json: { presence: "offline", due: 0, canEdit: !options.viewer },
      });
      return;
    }
    if (url.pathname.endsWith("/copilot")) {
      const context = JSON.parse(url.searchParams.get("context") ?? "{}");
      await route.fulfill({
        json: {
          companyName,
          context,
          threadId: url.searchParams.get("thread"),
          messages: [],
          threads: [],
          observations: [],
          feedback: [],
          brands: overview.brands,
          ai: {
            enabled: false,
            verified: false,
            canGenerate: false,
            status: "unconfigured",
            usage: { used: 0, limit: 30 },
          },
        },
      });
      return;
    }
    if (url.pathname.endsWith("/inbox") && req.method() === "GET") {
      await route.fulfill({
        json: url.searchParams.has("thread") ? detail : overview,
      });
      return;
    }
    if (/\/customers\/[^/]+\/memory$/.test(url.pathname)) {
      await route.fulfill({
        json: {
          brandId: "main",
          customerId: customer,
          brands: overview.brands,
          canEdit: !options.viewer,
          memories: [],
          history: [],
          timeline: [],
          nextCursor: null,
          coverage: {
            timelinePageSize: 30,
            historyLimit: 100,
            moreHistory: false,
          },
        },
      });
      return;
    }
    unexpected.push(req.method() + " " + url.pathname);
    await route.fulfill({
      status: 404,
      json: { error: "Unexpected isolated integration endpoint" },
    });
  });
  await page.clock.install({ time: new Date(now) });
  await page.goto(
    fixturePath +
      (options.initialWebsite
        ? `?provider=website&thread=${websiteThread}`
        : ""),
  );
  return {
    captures,
    unexpected,
    detail,
    overview,
    websitePage,
    websiteConversation,
    secondWebsiteConversation,
  };
}
