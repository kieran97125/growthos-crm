"use client";
import { useState } from "react";
import useSWR from "swr";
import {
  ChevronDown,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import type { SocialPostOption } from "@/lib/social-comments/provider";
type Page = { posts: SocialPostOption[]; nextCursor: string | null };
class PostReadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function read(url: string): Promise<Page> {
  const response = await fetch(url, { cache: "no-store" }),
    data = await response.json();
  if (!response.ok)
    throw new PostReadError(data.error ?? "未能讀取貼文。", response.status);
  return data;
}
export default function SocialPostPicker({
  endpoint,
  connectionId,
  channel,
  value,
  fixed,
  disabled,
  onChange,
}: {
  endpoint: string;
  connectionId: string;
  channel?: string;
  value: string;
  fixed: boolean;
  disabled: boolean;
  onChange(value: string): void;
}) {
  const [after, setAfter] = useState(""),
    url =
      connectionId && !fixed
        ? endpoint +
          "?" +
          new URLSearchParams({
            postsFor: connectionId,
            ...(after ? { after } : {}),
          })
        : null,
    { data, error, isLoading, isValidating, mutate } = useSWR<Page>(url, read),
    denied =
      error instanceof PostReadError && [401, 403].includes(error.status),
    visible = denied ? undefined : data,
    locked = disabled || denied,
    selected = visible?.posts.find((p) => p.id === value);
  if (fixed)
    return (
      <div className="sc-post-fixed">
        <strong>已選貼文</strong>
        <span>{value}</span>
        <small>如需更換貼文，建立另一個規則。</small>
      </div>
    );
  return (
    <div className="sc-post-picker">
      <div className="sc-post-label">
        <label htmlFor="sc-post">選擇貼文／Reel</label>
        <button
          type="button"
          className="sc-icon"
          aria-label="重新讀取帳戶貼文"
          disabled={!connectionId || isValidating || disabled}
          onClick={() => void mutate()}
        >
          <RefreshCw size={13} className={isValidating ? "sc-spin" : ""} />
        </button>
      </div>
      <select
        id="sc-post"
        value={selected ? value : ""}
        disabled={!connectionId || locked || isLoading || !!error}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{isLoading ? "正在讀取貼文…" : "揀一篇貼文"}</option>
        {visible?.posts.map((p) => (
          <option key={p.id} value={p.id}>
            {p.createdAt && Number.isFinite(Date.parse(p.createdAt))
              ? `${new Intl.DateTimeFormat("zh-HK", { timeZone: "Asia/Hong_Kong", month: "numeric", day: "numeric" }).format(new Date(p.createdAt))} · `
              : ""}
            {p.title}
          </option>
        ))}
      </select>
      {selected?.permalink && (
        <a href={selected.permalink} target="_blank" rel="noopener noreferrer">
          打開貼文
          <ExternalLink size={12} />
        </a>
      )}
      {error && (
        <p role="status" className="sc-post-error">
          {error.message}
        </p>
      )}
      {!error && !isLoading && visible && !visible.posts.length && (
        <p className="sc-post-error">未見可選貼文，可重新讀取或使用貼文 ID。</p>
      )}
      {visible?.nextCursor && (
        <button
          type="button"
          className="sc-post-more"
          disabled={locked || isValidating}
          onClick={() => setAfter(visible.nextCursor!)}
        >
          {isValidating ? (
            <LoaderCircle className="sc-spin" size={12} />
          ) : (
            <ChevronDown size={12} />
          )}
          下一頁貼文
        </button>
      )}
      <details className="sc-post-manual" open={!!value && !selected}>
        <summary>使用貼文 ID</summary>
        <label>
          貼文／Reel ID
          <input
            aria-label="貼文／Reel ID"
            value={value}
            disabled={locked}
            maxLength={101}
            placeholder={
              channel === "messenger"
                ? "例如：123456_789012"
                : "例如：17895695668004550"
            }
            onChange={(e) => onChange(e.target.value.trim())}
          />
        </label>
        <small>啟用時會核實貼文屬於所選帳戶。</small>
      </details>
    </div>
  );
}
