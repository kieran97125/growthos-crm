import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import ipaddr from "ipaddr.js";

export class WebsiteError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function websiteUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(
      /^[a-z][a-z\d+.-]*:/i.test(raw.trim())
        ? raw.trim()
        : `https://${raw.trim()}`,
    );
  } catch {
    throw new WebsiteError("invalid_url", "請輸入有效嘅品牌網站網址。");
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    isIP(host.replace(/^\[|\]$/g, "")) ||
    !host.includes(".") ||
    host.endsWith(".") ||
    /(^|\.)(localhost|local|internal|onion|invalid|test)$/.test(host)
  )
    throw new WebsiteError("unsafe_url", "請使用公開品牌網站嘅 HTTPS 網址。");
  if (url.href.length > 2048)
    throw new WebsiteError("invalid_url", "網址太長。");
  url.hash = "";
  url.search = "";
  return url;
}
export function sameWebsite(url: URL, root: URL) {
  return (
    url.hostname.replace(/^www\./, "") === root.hostname.replace(/^www\./, "")
  );
}
export type PublicAddress = { address: string; family: number };
export function isPublicAddress(address: string) {
  try {
    if (address === "168.63.129.16") return false;
    const parsed = ipaddr.process(address);
    return parsed.range() === "unicast";
  } catch {
    return false;
  }
}
export async function publicAddresses(
  host: string,
  resolver = lookup,
): Promise<PublicAddress[]> {
  const records = await resolver(host, { all: true, verbatim: true });
  if (!records.length || records.some((r) => !isPublicAddress(r.address)))
    throw new WebsiteError(
      "unsafe_destination",
      "此網址未能通過公開網站檢查。",
    );
  return records;
}
export type RawWebsiteResponse = {
  status: number;
  type: string;
  location: string;
  body: Buffer;
};
type Connect = (
  url: URL,
  pinned: PublicAddress,
  signal: AbortSignal,
  maxBytes: number,
) => Promise<RawWebsiteResponse>;
/** The checked address is the address actually connected to. No proxy, cookies or second DNS lookup. */
export const connectPublic: Connect = (url, pinned, signal, maxBytes) =>
  new Promise((resolve, reject) => {
    const fixedLookup = ((_host, options, cb) => {
      const callback = cb as (...args: unknown[]) => void;
      if (typeof options === "object" && options.all) callback(null, [pinned]);
      else callback(null, pinned.address, pinned.family);
    }) as LookupFunction;
    const req = request(
      url,
      {
        method: "GET",
        agent: false,
        family: pinned.family,
        lookup: fixedLookup,
        signal,
        servername: url.hostname,
        headers: {
          "User-Agent": "ConveltaBrandBot/1.0 (+https://convelta.io)",
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.8",
          "Accept-Encoding": "identity",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0,
          type = String(res.headers["content-type"] ?? "");
        const result = (body: Buffer) => ({
          status,
          type,
          location: String(res.headers.location ?? ""),
          body,
        });
        if (status >= 300 && status < 400) {
          res.destroy();
          resolve(result(Buffer.alloc(0)));
          return;
        }
        if (
          res.headers["content-encoding"] &&
          res.headers["content-encoding"] !== "identity"
        ) {
          res.destroy();
          reject(new WebsiteError("encoding", "網站傳回暫未支援嘅壓縮格式。"));
          return;
        }
        if (Number(res.headers["content-length"]) > maxBytes) {
          res.destroy();
          reject(new WebsiteError("too_large", "此頁內容太大，未有匯入。"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            res.destroy();
            reject(new WebsiteError("too_large", "此頁內容太大，未有匯入。"));
          } else chunks.push(chunk);
        });
        res.on("end", () => resolve(result(Buffer.concat(chunks))));
        res.on("error", reject);
        res.on("aborted", () =>
          reject(
            new WebsiteError("incomplete", "網站連線中斷，可稍後再掃描。"),
          ),
        );
      },
    );
    req.on("error", reject);
    req.setTimeout(8000, () =>
      req.destroy(new WebsiteError("timeout", "網站回應較慢，可稍後再掃描。")),
    );
    req.end();
  });
export async function fetchWebsite(
  raw: string,
  options: {
    root: string;
    signal: AbortSignal;
    maxBytes: number;
    beforeRequest?: (url: URL) => Promise<void>;
  },
  deps: {
    resolve?: (host: string) => Promise<PublicAddress[]>;
    connect?: Connect;
  } = {},
) {
  let url = websiteUrl(raw);
  const root = websiteUrl(options.root);
  for (let redirects = 0; redirects <= 3; redirects++) {
    options.signal.throwIfAborted();
    if (!sameWebsite(url, root))
      throw new WebsiteError(
        "external_redirect",
        "網站跳轉到其他網域，該頁未有匯入。",
      );
    await options.beforeRequest?.(url);
    let onAbort: () => void = () => {};
    const timeout = new Promise<never>((_, reject) => {
      onAbort = () =>
        reject(new WebsiteError("timeout", "網站回應較慢，可稍後再掃描。"));
      options.signal.addEventListener("abort", onAbort, { once: true });
    });
    let addresses: PublicAddress[];
    try {
      addresses = await Promise.race([
        (deps.resolve ?? publicAddresses)(url.hostname),
        timeout,
      ]);
    } finally {
      options.signal.removeEventListener("abort", onAbort);
    }
    options.signal.throwIfAborted();
    if (!addresses.length || addresses.some((r) => !isPublicAddress(r.address)))
      throw new WebsiteError(
        "unsafe_destination",
        "此網址未能通過公開網站檢查。",
      );
    const response = await (deps.connect ?? connectPublic)(
      url,
      addresses.find((r) => r.family === 4) ?? addresses[0],
      options.signal,
      options.maxBytes,
    );
    if (response.status >= 300 && response.status < 400) {
      if (!response.location || redirects === 3)
        throw new WebsiteError("redirect_limit", "網站跳轉次數過多。");
      url = websiteUrl(new URL(response.location, url).href);
      continue;
    }
    return { ...response, url: url.href };
  }
  throw new WebsiteError("redirect_limit", "網站跳轉次數過多。");
}
