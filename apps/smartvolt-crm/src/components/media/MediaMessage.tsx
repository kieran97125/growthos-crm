"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import useSWR from "swr";
import {
  Download,
  FileText,
  ImageIcon,
  LoaderCircle,
  Play,
  RefreshCw,
} from "lucide-react";
import type { MediaItem, MediaPage, MediaScope } from "@/lib/media/model";
import { kindNames } from "@/lib/media/model";
import "./media.css";

export type MediaMessageProps = MediaScope & {
  companyId: string;
  messageId: string;
  hideAudio?: boolean;
};
type Opened = {
  url: string;
  downloadUrl?: string;
  expiresAt: string;
  asset: {
    kind: MediaItem["kind"];
    filename: string;
    mimeType: string;
    bytes: number;
  };
};
async function read(url: string): Promise<MediaPage> {
  const r = await fetch(url, { cache: "no-store" }),
    d = await r.json();
  if (!r.ok) throw Error(d.error ?? "未能讀取附件。");
  return d;
}
export function mediaSize(n: number | null) {
  return n === null
    ? ""
    : n < 1024
      ? `${n} B`
      : n < 1024 * 1024
        ? `${Math.ceil(n / 1024)} KB`
        : `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function Item({
  item,
  endpoint,
  scope,
}: {
  item: MediaItem;
  endpoint: string;
  scope: MediaScope;
}) {
  const [opened, setOpened] = useState<Opened | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!opened) return;
    const timer = setTimeout(
      () => setExpired(true),
      Math.max(0, Date.parse(opened.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [opened]);
  async function open() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...scope,
            ...(item.assetId
              ? { action: "open", assetId: item.assetId }
              : {
                  action: "prepare",
                  messageId: item.messageId,
                  index: item.index,
                }),
          }),
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error ?? "未能開啟附件。");
      setExpired(false);
      setOpened(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "暫時未能開啟附件。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="cm-attachment"
      aria-label={kindNames[item.kind] + "附件"}
    >
      <div className="cm-attachment-heading">
        <span className="cm-file-icon">
          {item.kind === "image" ? (
            <ImageIcon size={19} />
          ) : item.kind === "document" ? (
            <FileText size={19} />
          ) : (
            <Play size={19} />
          )}
        </span>
        <span>
          <strong>{opened?.asset.filename ?? item.filename}</strong>
          <small>
            {kindNames[item.kind]}
            {item.bytes !== null ? " · " + mediaSize(item.bytes) : ""}
          </small>
        </span>
      </div>
      {opened && !expired && (
        <div className="cm-preview">
          {opened.asset.kind === "image" ? (
            <a href={opened.url} target="_blank" rel="noreferrer">
              <Image
                src={opened.url}
                alt={opened.asset.filename}
                width={640}
                height={480}
                unoptimized
                loading="lazy"
                onError={() => {
                  setOpened(null);
                  setError("附件連結已過期，請重新開啟。");
                }}
              />
            </a>
          ) : opened.asset.kind === "video" ? (
            <video
              src={opened.url}
              controls
              preload="metadata"
              aria-label={opened.asset.filename}
              onError={() =>
                setError("影片暫時未能播放，可以下載原檔或重新開啟。")
              }
            />
          ) : opened.asset.kind === "audio" ? (
            <audio
              src={opened.url}
              controls
              preload="metadata"
              aria-label={opened.asset.filename}
              onError={() =>
                setError("語音暫時未能播放，可以下載原檔或重新開啟。")
              }
            />
          ) : null}
          <a
            className="cm-download"
            href={opened.downloadUrl ?? opened.url}
            target="_blank"
            rel="noreferrer"
            download={opened.asset.filename}
          >
            <Download size={14} />
            {opened.asset.mimeType === "application/pdf"
              ? "開啟 PDF／下載"
              : "下載原檔"}
          </a>
        </div>
      )}
      {(!opened || expired) && (
        <button
          type="button"
          className="cm-open"
          onClick={() => void open()}
          disabled={busy || !item.available}
        >
          {busy ? (
            <LoaderCircle size={15} className="cm-spin" />
          ) : expired ? (
            <RefreshCw size={15} />
          ) : (
            <Download size={15} />
          )}{" "}
          {busy
            ? "正在取得附件…"
            : !item.available
              ? "原平台附件暫時不可用"
              : expired
                ? "重新開啟附件"
                : "開啟附件"}
        </button>
      )}
      {error && (
        <div className="cm-inline-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void open()} disabled={busy}>
            再試
          </button>
        </div>
      )}
    </section>
  );
}
export default function MediaMessage({
  companyId,
  messageId,
  hideAudio = false,
  ...scope
}: MediaMessageProps) {
  const endpoint = `/api/companies/${encodeURIComponent(companyId)}/media`,
    url = endpoint + "?" + new URLSearchParams({ ...scope, messageId });
  const { data, error, mutate } = useSWR<MediaPage>(url, read, {
    keepPreviousData: false,
    shouldRetryOnError: false,
    revalidateOnFocus: false,
  });
  if (error)
    return (
      <div className="cm-inline-error" role="alert">
        <span>未能讀取附件。</span>
        <button type="button" onClick={() => void mutate()}>
          重新讀取
        </button>
      </div>
    );
  if (!data)
    return (
      <small className="cm-loading" role="status">
        讀取附件…
      </small>
    );
  return (
    <div className="cm-attachments">
      {data.items
        .filter((i) => !hideAudio || i.kind !== "audio")
        .map((item) => (
          <Item key={item.id} item={item} endpoint={endpoint} scope={scope} />
        ))}
    </div>
  );
}
