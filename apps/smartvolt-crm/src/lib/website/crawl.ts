import { createHash } from "node:crypto";
import { loadBuffer } from "cheerio";
import robotsParser from "robots-parser";
import { articleSchema } from "@/components/crm/studio/model";
import {
  WEBSITE_LIMITS,
  websiteStateSchema,
  type WebsiteState,
  type WebsitePage,
} from "./model";
import {
  fetchWebsite,
  sameWebsite,
  websiteUrl,
  WebsiteError,
} from "./transport";

const bot = "ConveltaBrandBot",
  hash = (text: string) => createHash("sha256").update(text).digest("hex");
const clean = (text: string) =>
  text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t\r]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
const unique = (items: string[], max = 8) =>
  [...new Set(items.map(clean).filter(Boolean))].slice(0, max);
export function initialWebsiteState(url: string): WebsiteState {
  const normalized = websiteUrl(url).href;
  return {
    version: 1,
    inputUrl: normalized,
    queue: [normalized],
    visited: [],
    pages: [],
    robots: [],
    warnings: [],
    candidates: [],
  };
}
function categoryFor(url: string, label = ""): WebsitePage["category"] {
  const s = decodeURI(url).toLowerCase() + " " + label;
  if (/contact|location|branch|聯絡|分店|地址/.test(s)) return "contact";
  if (/faq|frequently|常見問題/.test(s)) return "faq";
  if (/privacy|policy|terms|refund|條款|政策|私隱|退換/.test(s))
    return "policy";
  if (/about|our-story|關於|品牌故事/.test(s)) return "about";
  if (
    /service|product|treatment|pricing|price|offer|服務|療程|產品|收費/.test(s)
  )
    return "services";
  return "overview";
}
export function extractWebsitePage(
  body: Buffer,
  url: string,
  at = new Date().toISOString(),
  contentType = "text/html",
) {
  const charset = contentType.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1];
  const $ = loadBuffer(body, {
      encoding: {
        defaultEncoding: "utf-8",
        transportLayerEncodingLabel: charset,
      },
    }),
    rootUrl = websiteUrl(url);
  const title = clean(
    $("h1").first().text() ||
      $("meta[property='og:title']").attr("content") ||
      $("title").text() ||
      rootUrl.hostname,
  ).slice(0, 100);
  const description = clean(
    $("meta[name='description']").attr("content") ||
      $("meta[property='og:description']").attr("content") ||
      "",
  ).slice(0, 500);
  const phones = unique(
    $("a[href^='tel:']")
      .map((_, e) => ($(e).attr("href") ?? "").slice(4))
      .get(),
  );
  const emails = unique(
    $("a[href^='mailto:']")
      .map((_, e) => ($(e).attr("href") ?? "").slice(7).split("?")[0])
      .get(),
  ).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  const addresses = unique(
    $("address, [itemprop='streetAddress']")
      .map((_, e) => $(e).text().slice(0, 300))
      .get(),
  );
  const hours: string[] = [];
  // Read only named business properties. JSON-LD never becomes executable instructions.
  $("script[type='application/ld+json']")
    .slice(0, 8)
    .each((_, e) => {
      const raw = $(e).text();
      if (raw.length > 50000) return;
      try {
        const parsed = JSON.parse(raw),
          list = Array.isArray(parsed) ? parsed : [parsed];
        const nodes = list.flatMap((o) =>
          o && typeof o === "object"
            ? [
                o,
                ...(Array.isArray(o["@graph"]) ? o["@graph"].slice(0, 20) : []),
              ]
            : [],
        );
        for (const o of nodes) {
          if (!o || typeof o !== "object") continue;
          if (typeof o.telephone === "string")
            phones.push(o.telephone.slice(0, 80));
          if (
            typeof o.email === "string" &&
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)
          )
            emails.push(o.email.slice(0, 160));
          if (o.address && typeof o.address === "object")
            addresses.push(
              [
                o.address.streetAddress,
                o.address.addressLocality,
                o.address.addressRegion,
                o.address.postalCode,
              ]
                .filter((v) => typeof v === "string")
                .join(" ")
                .slice(0, 300),
            );
          const opening = Array.isArray(o.openingHours)
            ? o.openingHours
            : [o.openingHours];
          opening
            .filter((v: unknown) => typeof v === "string")
            .slice(0, 8)
            .forEach((v: string) => hours.push(v.slice(0, 300)));
        }
      } catch {
        /* Malformed metadata does not invalidate readable HTML. */
      }
    });
  const links: { url: string; score: number }[] = [];
  $("a[href]")
    .slice(0, 400)
    .each((_, el) => {
      try {
        const link = websiteUrl(new URL($(el).attr("href")!, rootUrl).href);
        if (
          !sameWebsite(link, rootUrl) ||
          /\.(pdf|zip|png|jpe?g|gif|webp|svg|mp[34]|docx?|xlsx?)$/i.test(
            link.pathname,
          ) ||
          /\/(api|admin|login|sign-in|account|cart|checkout|search)(\/|$)/i.test(
            link.pathname,
          )
        )
          return;
        const category = categoryFor(link.href, $(el).text());
        const score = {
          about: 1,
          services: 2,
          contact: 3,
          faq: 4,
          policy: 5,
          overview: 9,
        }[category];
        if (link.href !== rootUrl.href && score < 9)
          links.push({ url: link.href, score });
      } catch {
        /* Not a public navigable brand link. */
      }
    });
  $(
    "script,style,noscript,iframe,svg,canvas,form,nav,header,footer,button,input,select,textarea,[hidden],[aria-hidden='true']",
  ).remove();
  const main = $("main").first().length ? $("main").first() : $("body");
  main.find("br").replaceWith("\n");
  main.find("h1,h2,h3,h4,p,li,tr,section,div,address").append("\n");
  const facts = [
    description,
    ...unique(phones),
    ...unique(emails),
    ...unique(addresses),
    ...unique(hours),
  ].filter(Boolean);
  const text = clean([title, ...facts, main.text()].join("\n"));
  const page: WebsitePage = {
    id: hash(rootUrl.href).slice(0, 24),
    url: rootUrl.href,
    title,
    description,
    category: rootUrl.pathname === "/" ? "overview" : categoryFor(rootUrl.href),
    text: text.slice(0, WEBSITE_LIMITS.text),
    fetchedAt: at,
    truncated: text.length > WEBSITE_LIMITS.text,
    phones: unique(phones).map((v) => v.slice(0, 80)),
    emails: unique(emails).map((v) => v.slice(0, 160)),
    addresses: unique(addresses),
    hours: unique(hours),
  };
  return {
    page,
    links: unique(
      links.sort((a, b) => a.score - b.score).map((l) => l.url),
      WEBSITE_LIMITS.links,
    ),
  };
}
export function websiteCandidates(
  state: WebsiteState,
  companyId: string,
  brandId: string,
  importId: string,
) {
  return state.pages.flatMap((page) => {
    const chunks: string[] = [];
    let remaining = page.text;
    while (remaining.length && chunks.length < 3) {
      let end = Math.min(5000, remaining.length);
      if (end < remaining.length) {
        const boundary = remaining.lastIndexOf("\n", end);
        if (boundary > 3000) end = boundary;
      }
      chunks.push(remaining.slice(0, end).trim());
      remaining = remaining.slice(end).trim();
    }
    return chunks.filter(Boolean).map((content, i) =>
      articleSchema.parse({
        id: `web-${importId}-${page.id.slice(0, 12)}-${i}`,
        clientId: companyId,
        brandId,
        title: (
          page.title.slice(0, 85) +
          (chunks.length > 1 ? ` · ${i + 1}/${chunks.length}` : "")
        ).slice(0, 100),
        content,
        keywords: [page.title.slice(0, 50)],
        source: `網站 · ${new URL(page.url).hostname}`.slice(0, 120),
        status: "draft",
        revision: 1,
        validUntil: new Date(Date.parse(page.fetchedAt) + 180 * 86400000)
          .toISOString()
          .slice(0, 10),
        website: {
          importId,
          url: page.url,
          fetchedAt: page.fetchedAt,
          contentHash: hash(content),
          truncated: page.truncated,
        },
      }),
    );
  });
}
export async function stepWebsiteState(
  previous: WebsiteState,
  companyId: string,
  brandId: string,
  importId: string,
  fetcher: typeof fetchWebsite = fetchWebsite,
) {
  const state = structuredClone(previous),
    next = state.queue.shift();
  if (!next || state.visited.length >= WEBSITE_LIMITS.pages)
    return { state, status: state.pages.length ? "ready" : "failed" } as const;
  const signal = AbortSignal.timeout(16000);
  const checkRobots = async (url: URL) => {
    let rules = state.robots.find((r) => r.origin === url.origin);
    if (!rules) {
      const response = await fetcher(`${url.origin}/robots.txt`, {
        root: state.inputUrl,
        signal,
        maxBytes: WEBSITE_LIMITS.robotsBytes,
      });
      if (response.status === 401 || response.status === 403)
        throw new WebsiteError("robots_denied", "網站限制自動讀取。");
      if (response.status >= 500 || response.status === 429)
        throw new WebsiteError(
          "robots_unavailable",
          "網站暫時未能確認爬取規則。",
        );
      if (![200, 404, 410].includes(response.status))
        throw new WebsiteError(
          "robots_unavailable",
          "網站暫時未能確認爬取規則。",
        );
      rules = {
        origin: url.origin,
        text:
          response.status === 200 && !/text\/html/i.test(response.type)
            ? response.body.toString("utf8")
            : "",
      };
      if (rules.text.length > WEBSITE_LIMITS.robotsBytes)
        throw new WebsiteError("robots_size", "網站爬取規則太長。");
      state.robots.push(rules);
    }
    const parser = robotsParser(`${url.origin}/robots.txt`, rules.text);
    if (parser.isAllowed(url.href, bot) === false)
      throw new WebsiteError("robots_denied", "網站不允許掃描此頁。");
    const delay = parser.getCrawlDelay(bot) ?? 0;
    if (delay > 10)
      throw new WebsiteError(
        "crawl_delay",
        "網站要求較長掃描間隔，請改用手動新增資料。",
      );
    if (delay > 0)
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delay * 1000);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new WebsiteError("timeout", "網站回應較慢。"));
          },
          { once: true },
        );
      });
  };
  state.visited.push(next);
  try {
    const response = await fetcher(next, {
      root: state.inputUrl,
      signal,
      maxBytes: WEBSITE_LIMITS.htmlBytes,
      beforeRequest: checkRobots,
    });
    if (response.status !== 200)
      throw new WebsiteError(
        "http_status",
        response.status === 403
          ? "網站限制自動讀取。"
          : `此頁暫時未能讀取（${response.status}）。`,
      );
    if (!/^(text\/html|application\/xhtml\+xml)(;|$)/i.test(response.type))
      throw new WebsiteError("content_type", "此網址未有可讀取嘅網頁內容。");
    const { page, links } = extractWebsitePage(
      response.body,
      response.url,
      new Date().toISOString(),
      response.type,
    );
    if (page.text.length < 60)
      throw new WebsiteError(
        "render_required",
        "此頁文字不足，可能需要登入或載入互動內容。可改用手動新增資料。",
      );
    if (!state.pages.some((p) => p.url === page.url)) state.pages.push(page);
    state.queue = unique(
      [...state.queue, ...links].filter(
        (u) =>
          !state.visited.includes(u) && !state.pages.some((p) => p.url === u),
      ),
      WEBSITE_LIMITS.links,
    );
  } catch (error) {
    state.warnings.push({
      url: next,
      reason:
        error instanceof WebsiteError
          ? error.message
          : "此頁連線未完成，可稍後重新掃描。",
    });
  }
  state.candidates = websiteCandidates(state, companyId, brandId, importId);
  const complete =
    !state.queue.length || state.visited.length >= WEBSITE_LIMITS.pages;
  return {
    state: websiteStateSchema.parse(state),
    status: complete ? (state.pages.length ? "ready" : "failed") : "queued",
  } as const;
}
