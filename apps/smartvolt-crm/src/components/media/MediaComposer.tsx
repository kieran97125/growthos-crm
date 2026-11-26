"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileUp,
  LoaderCircle,
  Paperclip,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Modal } from "@/components/crm/conversations/WorkspacePrimitives";
import {
  MEDIA_MAX_BYTES,
  MEDIA_MIME_TYPES,
  kindNames,
  supportedMedia,
  type MediaAsset,
  type MediaReceipt,
  type MediaScope,
} from "@/lib/media/model";
import { mediaSize } from "./MediaMessage";
import "./media.css";

export type MediaComposerProps = MediaScope & {
  companyId: string;
  actorId: string;
  channel?: "messenger" | "instagram";
  revision: number;
  canSend: boolean;
  disabled?: boolean;
  acquireEditor: () => Promise<string | null>;
  onSent: () => void | Promise<unknown>;
};
type Transfer = {
  id: string;
  filename: string;
  mimeType: string;
  bytes: number;
  asset: MediaAsset | null;
  receipt: MediaReceipt | null;
  clientId: string | null;
  retained?: boolean;
};
class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
const PENDING_EVENT = "convelta-media-pending";
function subscribePending(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(PENDING_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(PENDING_EVENT, onChange);
  };
}
function pendingSnapshot(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function mime(file: File) {
  const type = file.type.toLowerCase();
  return type === "audio/x-m4a" || type === "audio/m4a"
    ? "audio/mp4"
    : type === "audio/mp3"
      ? "audio/mpeg"
      : type;
}
async function post<T>(endpoint: string, body: unknown): Promise<T> {
  const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    d = await r.json();
  if (!r.ok)
    throw new RequestError(
      d.error ?? "結果仍待核對，請重試同一操作。",
      r.status,
    );
  return d;
}
function upload(
  url: string,
  file: File,
  onProgress: (n: number) => void,
  onCreate: (x: XMLHttpRequest) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const u = new URL(url);
    if (
      u.protocol !== "https:" ||
      !u.pathname.includes(
        "/storage/v1/object/upload/sign/convelta-attachments/",
      )
    ) {
      reject(Error("上載位置未通過核對。"));
      return;
    }
    const xhr = new XMLHttpRequest();
    onCreate(xhr);
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.timeout = 120000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onerror = () => reject(Error("上載連線中斷，請核對同一檔案。"));
    xhr.ontimeout = () => reject(Error("上載逾時，請核對同一檔案。"));
    xhr.onabort = () => reject(new DOMException("已取消上載。", "AbortError"));
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(Error("未能確認上載，請核對同一檔案。"));
    const form = new FormData();
    form.append("cacheControl", "0");
    form.append("", new Blob([file], { type: mime(file) }), file.name);
    xhr.send(form);
  });
}
function Composer(p: MediaComposerProps) {
  const endpoint = `/api/companies/${encodeURIComponent(p.companyId)}/media`,
    scope: MediaScope = {
      brandId: p.brandId,
      source: p.source,
      sourceId: p.sourceId,
    },
    legacyStorageKey = `convelta-media:${p.companyId}:${p.source}:${p.sourceId}`,
    storageKey = `convelta-media:${p.actorId}:${p.companyId}:${p.source}:${p.sourceId}`;
  const [open, setOpen] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [localTransfer, setTransfer] = useState<Transfer | null>(null),
    [caption, setCaption] = useState(""),
    [phase, setPhase] = useState<
      "idle" | "uploading" | "verifying" | "sending" | "checking" | "cancelling"
    >("idle"),
    [progress, setProgress] = useState(0),
    [error, setError] = useState("");
  const xhr = useRef<XMLHttpRequest | null>(null),
    lock = useRef(false),
    cancelled = useRef(false),
    operation = useRef(0),
    active = useRef(true),
    input = useRef<HTMLInputElement | null>(null);
  const persisted = useSyncExternalStore(
    subscribePending,
    () => pendingSnapshot(storageKey),
    () => null,
  );
  const restored = useMemo(() => {
    try {
      const t = JSON.parse(persisted ?? "null");
      return t &&
        typeof t.id === "string" &&
        typeof t.filename === "string" &&
        typeof t.clientId === "string"
        ? (t as Transfer)
        : null;
    } catch {
      return null;
    }
  }, [persisted]);
  const transfer = localTransfer ?? restored;
  useEffect(() => {
    active.current = true;
    // Legacy drafts were not actor-scoped. Discard them without reading or migrating.
    try {
      sessionStorage.removeItem(legacyStorageKey);
    } catch {}
    return () => {
      active.current = false;
      xhr.current?.abort();
    };
  }, [storageKey, legacyStorageKey]);
  const busy = phase !== "idle",
    unresolved =
      !!transfer?.clientId &&
      (!transfer.receipt ||
        ["sending", "unknown"].includes(transfer.receipt.state)),
    allowed = p.canSend && !p.disabled;
  function save(t: Transfer | null) {
    setTransfer(t);
    try {
      if (t?.clientId) sessionStorage.setItem(storageKey, JSON.stringify(t));
      else sessionStorage.removeItem(storageKey);
    } catch {}
    window.dispatchEvent(new Event(PENDING_EVENT));
  }
  async function choose(next: File | null) {
    if (!next || busy || unresolved) return;
    setError("");
    if (next.size > MEDIA_MAX_BYTES || !next.size) {
      setError("請選擇不超過25 MB嘅檔案。");
      return;
    }
    if (!(MEDIA_MIME_TYPES as readonly string[]).includes(mime(next))) {
      setError("請選擇圖片、MP4影片、MP3／M4A語音、PDF或Office文件。");
      return;
    }
    const kind = mime(next).startsWith("image/")
      ? "image"
      : mime(next).startsWith("video/")
        ? "video"
        : mime(next).startsWith("audio/")
          ? "audio"
          : "document";
    if (!supportedMedia(kind, mime(next), p.source, p.channel)) {
      setError(
        p.channel === "instagram"
          ? "此渠道嘅文件請用 PDF；相片、語音及影片可以分開傳送。"
          : "此渠道未支援呢個格式，請改用 JPG、PNG、MP4、MP3、M4A 或 PDF。",
      );
      return;
    }
    if (transfer && !transfer.retained) {
      try {
        await post(endpoint, {
          ...scope,
          action: "cancel",
          assetId: transfer.id,
        });
      } catch (e) {
        if (!(e instanceof RequestError && e.status === 404)) {
          setError("上一個附件未能取消，請先核對。");
          return;
        }
      }
    }
    setFile(next);
    save({
      id: crypto.randomUUID(),
      filename: next.name,
      mimeType: mime(next),
      bytes: next.size,
      asset: null,
      receipt: null,
      clientId: null,
    });
    setProgress(0);
    setCaption("");
  }
  async function verify(t: Transfer) {
    const d = await post<{ asset: MediaAsset }>(endpoint, {
      ...scope,
      action: "complete",
      assetId: t.id,
    });
    return { ...t, asset: d.asset };
  }
  async function prepare() {
    if (lock.current || !transfer || !file || !allowed) return;
    lock.current = true;
    const epoch = ++operation.current;
    cancelled.current = false;
    setPhase("uploading");
    setError("");
    const t = transfer;
    try {
      const r = await post<{ asset?: MediaAsset; uploadUrl?: string | null }>(
        endpoint,
        {
          ...scope,
          action: "reserve",
          requestId: t.id,
          filename: t.filename,
          bytes: t.bytes,
          mimeType: t.mimeType,
        },
      );
      if (cancelled.current || epoch !== operation.current) return;
      if (r.asset) {
        if (active.current) save({ ...t, asset: r.asset });
        return;
      }
      if (!r.uploadUrl) throw Error("上載位置未能確認。");
      try {
        await upload(r.uploadUrl, file, setProgress, (x) => {
          xhr.current = x;
        });
      } catch (e) {
        if (cancelled.current)
          throw e; /* The object may already exist after a lost response. Verify exact bytes instead of overwriting. */
      }
      if (cancelled.current || epoch !== operation.current) return;
      setPhase("verifying");
      const ready = await verify(t);
      if (active.current && !cancelled.current && epoch === operation.current) {
        save(ready);
        setProgress(100);
      }
    } catch (e) {
      if (active.current && !cancelled.current && epoch === operation.current)
        setError(e instanceof Error ? e.message : "未能完成上載。");
    } finally {
      if (epoch === operation.current) {
        lock.current = false;
        xhr.current = null;
        if (active.current) setPhase("idle");
      }
    }
  }
  async function cancel() {
    if (
      phase === "sending" ||
      phase === "checking" ||
      phase === "cancelling" ||
      unresolved
    )
      return;
    cancelled.current = true;
    operation.current++;
    lock.current = false;
    xhr.current?.abort();
    xhr.current = null;
    setPhase("cancelling");
    const t = transfer;
    if (!t) {
      setOpen(false);
      setPhase("idle");
      return;
    }
    const clear = () => {
      if (!active.current) return;
      save(null);
      setFile(null);
      setCaption("");
      setError("");
      setProgress(0);
      setOpen(false);
      if (input.current) input.current.value = "";
    };
    if (t.retained) {
      clear();
      setPhase("idle");
      return;
    }
    try {
      await post(endpoint, { ...scope, action: "cancel", assetId: t.id });
      clear();
    } catch (e) {
      // An unreserved local file has no server-side record to cancel.
      if (e instanceof RequestError && e.status === 404) clear();
      else if (active.current)
        setError(e instanceof Error ? e.message : "取消結果待核對。");
    } finally {
      if (active.current) setPhase("idle");
    }
  }
  async function send() {
    if (lock.current || !transfer?.asset || !allowed || unresolved) return;
    lock.current = true;
    setError("");
    setPhase("sending");
    const t = transfer;
    try {
      const editorToken = await p.acquireEditor();
      if (!editorToken || !active.current) {
        setError("請先取得呢段對話嘅回覆權限。");
        return;
      }
      const pending = { ...t, clientId: crypto.randomUUID(), receipt: null };
      save(pending);
      const d = await post<{ receipt: MediaReceipt }>(endpoint, {
        ...scope,
        action: "send",
        assetId: t.id,
        clientId: pending.clientId,
        revision: p.revision,
        caption:
          p.source === "meta" || t.asset?.kind === "audio" ? "" : caption,
        editorToken,
      });
      if (active.current) {
        save({ ...pending, receipt: d.receipt, retained: true });
        await p.onSent();
      }
    } catch (e) {
      if (active.current) {
        if (
          e instanceof RequestError &&
          [400, 401, 403, 404, 409, 410, 422].includes(e.status)
        ) {
          save({ ...t, clientId: null });
        }
        setError(e instanceof Error ? e.message : "傳送結果仍待核對。");
      }
    } finally {
      lock.current = false;
      if (active.current) setPhase("idle");
    }
  }
  async function check() {
    if (lock.current || !transfer?.clientId) return;
    lock.current = true;
    setPhase("checking");
    setError("");
    try {
      const d = await post<{ receipt: MediaReceipt }>(endpoint, {
        ...scope,
        action: "receipt",
        clientId: transfer.clientId,
      });
      if (active.current) {
        save({ ...transfer, receipt: d.receipt, retained: true });
        await p.onSent();
      }
    } catch (e) {
      if (active.current)
        setError(e instanceof Error ? e.message : "暫時未能核對。");
    } finally {
      lock.current = false;
      if (active.current) setPhase("idle");
    }
  }
  function reset() {
    if (unresolved || busy) return;
    save(null);
    setFile(null);
    setCaption("");
    setProgress(0);
    setError("");
    if (input.current) input.current.value = "";
  }
  const success =
      transfer?.receipt &&
      ["accepted", "sent", "delivered", "read"].includes(
        transfer.receipt.state,
      ),
    failed = transfer?.receipt?.state === "failed",
    captionAllowed =
      transfer?.asset &&
      p.source === "whatsapp" &&
      transfer.asset.kind !== "audio";
  return (
    <>
      <button
        type="button"
        className={`cm-attach-button${unresolved ? " cm-attach-pending" : ""}`}
        aria-label={unresolved ? "核對附件傳送" : "加入附件"}
        onClick={() => setOpen(true)}
        disabled={(!p.canSend || p.disabled) && !unresolved}
      >
        <Paperclip size={16} />
        <span>{unresolved ? "附件待核對" : "附件"}</span>
      </button>
      {open && (
        <Modal
          title={unresolved ? "核對附件傳送" : "傳送附件"}
          onClose={() => setOpen(false)}
        >
          <div className="cm-composer-dialog">
            <input
              className="cm-file-input"
              ref={input}
              id={`cm-file-${p.sourceId}`}
              type="file"
              aria-label="選擇附件"
              accept={MEDIA_MIME_TYPES.join(",")}
              disabled={busy || unresolved || !!success}
              onChange={(e) => void choose(e.target.files?.[0] ?? null)}
            />
            {!transfer ? (
              <label
                className="cm-drop-zone"
                htmlFor={`cm-file-${p.sourceId}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void choose(e.dataTransfer.files[0] ?? null);
                }}
              >
                <FileUp size={31} />
                <strong>選擇圖片、影片或文件</strong>
                <span>圖片5 MB · 語音／影片16 MB · 文件25 MB</span>
                <small>實際可傳格式按渠道提供</small>
              </label>
            ) : (
              <div className="cm-upload-card">
                <span className="cm-upload-icon">
                  <FileUp size={24} />
                </span>
                <div>
                  <strong>{transfer.filename}</strong>
                  <small>
                    {mediaSize(transfer.bytes)}
                    {transfer.asset
                      ? " · " + kindNames[transfer.asset.kind]
                      : ""}
                  </small>
                </div>
                {!busy && !unresolved && !success && (
                  <button
                    type="button"
                    className="cm-icon-button"
                    aria-label="移除附件"
                    onClick={() => void cancel()}
                  >
                    <Trash2 size={17} />
                  </button>
                )}
              </div>
            )}
            {(phase === "uploading" || phase === "verifying") && (
              <div className="cm-progress">
                <progress
                  aria-label="附件上載進度"
                  max={100}
                  value={phase === "verifying" ? 100 : progress}
                />
                <span>
                  {phase === "verifying"
                    ? "核對檔案內容…"
                    : `正在上載 ${progress}%`}
                </span>
              </div>
            )}
            {transfer?.asset && !transfer.clientId && (
              <p className="cm-private-note">
                <ShieldCheck size={14} />
                附件已核對，確認後先會傳送。
              </p>
            )}
            {captionAllowed && !transfer?.clientId && (
              <label className="cm-caption">
                附加文字
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="可選填"
                  disabled={busy}
                />
              </label>
            )}
            {error && (
              <p className="cm-inline-error" role="alert">
                <AlertCircle size={16} />
                {error}
              </p>
            )}
            {unresolved && (
              <p className="cm-pending-note" role="status">
                傳送結果仍待核對；系統會沿用原有紀錄，避免重複訊息。
              </p>
            )}
            {success && (
              <p className="cm-success" role="status">
                <CheckCircle2 size={17} />
                {transfer.receipt?.state === "read"
                  ? "客人已讀"
                  : transfer.receipt?.state === "delivered"
                    ? "已送達客人"
                    : "平台已接收；送達狀態會繼續更新。"}
              </p>
            )}
            {failed && (
              <p className="cm-inline-error" role="alert">
                平台確認傳送失敗。請核對連接及檔案後再試。
              </p>
            )}
            <div className="cm-dialog-actions">
              {success ? (
                <>
                  <button
                    type="button"
                    className="cm-secondary"
                    onClick={() => {
                      reset();
                      setOpen(false);
                    }}
                  >
                    完成
                  </button>
                </>
              ) : unresolved ? (
                <button
                  type="button"
                  className="cm-primary"
                  disabled={busy}
                  onClick={() => void check()}
                >
                  {busy ? <LoaderCircle className="cm-spin" size={16} /> : null}
                  核對傳送結果
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="cm-secondary"
                    disabled={phase === "sending" || phase === "cancelling"}
                    onClick={() => void cancel()}
                  >
                    {busy ? "取消上載" : "取消"}
                  </button>
                  {failed ? (
                    <button
                      type="button"
                      className="cm-primary"
                      disabled={!allowed || busy}
                      onClick={() =>
                        save({ ...transfer!, clientId: null, receipt: null })
                      }
                    >
                      準備重試
                    </button>
                  ) : transfer?.asset ? (
                    <button
                      type="button"
                      className="cm-primary"
                      onClick={() => void send()}
                      disabled={!allowed || busy}
                    >
                      {phase === "sending" ? (
                        <LoaderCircle className="cm-spin" size={16} />
                      ) : (
                        <Send size={15} />
                      )}
                      傳送附件
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="cm-primary"
                      onClick={() => void prepare()}
                      disabled={!allowed || !file || !transfer || busy}
                    >
                      {busy ? (
                        <LoaderCircle className="cm-spin" size={16} />
                      ) : (
                        <FileUp size={15} />
                      )}
                      上載並核對
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
export default function MediaComposer(p: MediaComposerProps) {
  return (
    <Composer
      key={[p.actorId, p.companyId, p.brandId, p.source, p.sourceId].join(":")}
      {...p}
    />
  );
}
