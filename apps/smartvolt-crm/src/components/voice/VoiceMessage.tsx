"use client";
import { useCallback, useState, type ChangeEvent } from "react";
import useSWR, { useSWRConfig } from "swr";
import {
  AudioLines,
  FileAudio,
  LoaderCircle,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import { VOICE_MAX_BYTES, VOICE_MIME_TYPES } from "@/lib/voice/constants";
import type { VoiceItem, VoicePage, VoiceSource } from "@/lib/voice/model";
import { formatHongKongDateTime } from "@/lib/datetime";
import VoiceTranscriptView from "./VoiceTranscriptView";
import type { ItemState } from "./types";
import "./voice.css";

class VoiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly terminalFailure = false,
  ) {
    super(message);
  }
}
async function readVoice(url: string): Promise<VoicePage> {
  const r = await fetch(url, { cache: "no-store" }),
    d = await r.json();
  if (!r.ok) throw new VoiceError(d.error ?? "未能讀取語音。", r.status);
  return d;
}
async function command<T>(
  url: string,
  body: Record<string, unknown> | FormData,
): Promise<T> {
  const r = await fetch(url, {
      method: "POST",
      ...(body instanceof FormData
        ? { body }
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    }),
    d = await r.json();
  if (!r.ok)
    throw new VoiceError(
      d.error ?? "結果未能確認，請核對同一操作。",
      r.status,
      d.terminalFailure === true,
    );
  return d;
}
const known = (e: unknown) =>
  e instanceof VoiceError && (e.status < 500 || e.terminalFailure);
const blank: ItemState = {
  busy: false,
  pending: null,
  error: "",
  notice: "",
  editing: false,
  draft: "",
  reason: "",
  revision: 0,
  transcriptId: "",
  correction: null,
};
type UploadState = {
  file: File | null;
  requestId: string;
  busy: boolean;
  pending: boolean;
  error: string;
  notice: string;
};
export type VoiceMessageProps = {
  companyId: string;
  brandId: string;
  source: VoiceSource;
  sourceId: string;
  messageId?: string;
};
export default function VoiceMessage({
  companyId,
  brandId,
  source,
  sourceId,
  messageId,
}: VoiceMessageProps) {
  const endpoint = `/api/companies/${encodeURIComponent(companyId)}/voice`,
    url =
      endpoint +
      "?" +
      new URLSearchParams({
        brandId,
        source,
        sourceId,
        ...(messageId ? { messageId } : {}),
      }),
    scope = `${companyId}:${brandId}:${source}:${sourceId}:${messageId ?? "thread"}`;
  const { mutate: cacheMutate } = useSWRConfig(),
    { data, error, isLoading, isValidating } = useSWR<VoicePage>(
      brandId && sourceId ? url : null,
      readVoice,
      {
        keepPreviousData: false,
        shouldRetryOnError: false,
        refreshInterval: (current) =>
          current?.items.some((i) => i.status === "running") ? 2500 : 0,
      },
    );
  const [states, setStates] = useState<Record<string, ItemState>>({}),
    [uploads, setUploads] = useState<Record<string, UploadState>>({});
  const refresh = useCallback(() => cacheMutate(url), [cacheMutate, url]);
  const upload = uploads[scope] ?? {
    file: null,
    requestId: "",
    busy: false,
    pending: false,
    error: "",
    notice: "",
  };
  function update(key: string, fn: (s: ItemState) => ItemState) {
    setStates((old) => ({ ...old, [key]: fn(old[key] ?? blank) }));
  }
  function updateUpload(key: string, fn: (s: UploadState) => UploadState) {
    setUploads((old) => ({
      ...old,
      [key]: fn(
        old[key] ?? {
          file: null,
          requestId: "",
          busy: false,
          pending: false,
          error: "",
          notice: "",
        },
      ),
    }));
  }
  async function transcribe(item: VoiceItem) {
    const key = `${scope}:${item.id}`,
      state = states[key] ?? blank;
    if (state.busy) return;
    const startedUrl = url,
      body = state.pending ?? {
        type: "transcribe",
        requestId: item.requestId ?? crypto.randomUUID(),
        brandId,
        source,
        sourceId,
        messageId: item.messageId,
      };
    update(key, (s) => ({
      ...s,
      busy: true,
      pending: body,
      error: "",
      notice: "",
    }));
    try {
      const response = await command<{ item?: VoiceItem; state?: "running" }>(
        endpoint,
        body,
      );
      if (response.state === "running") {
        update(key, (s) => ({
          ...s,
          busy: false,
          notice: "轉錄仍在處理，稍後核對同一請求。",
        }));
        await cacheMutate(startedUrl);
        return;
      }
      if (!response.item) throw Error("轉錄結果未能確認，請核對同一請求。");
      await cacheMutate<VoicePage>(
        startedUrl,
        (current) =>
          current
            ? {
                ...current,
                items: current.items.map((i) =>
                  i.id === item.id ? response.item! : i,
                ),
              }
            : current,
        { revalidate: true },
      );
      update(key, (s) => ({
        ...s,
        busy: false,
        pending: null,
        notice: "逐字稿已儲存，可對照原音修正。",
      }));
      window.dispatchEvent(new Event("convelta:data-changed"));
    } catch (e) {
      update(key, (s) => ({
        ...s,
        busy: false,
        pending: known(e) ? null : body,
        error:
          e instanceof Error ? e.message : "結果未能確認，請核對同一轉錄。",
      }));
    }
  }
  async function saveCorrection(item: VoiceItem) {
    const key = `${scope}:${item.id}`,
      state = states[key] ?? blank;
    if (state.busy) return;
    const startedUrl = url,
      body = state.correction ?? {
        type: "correct",
        commandId: crypto.randomUUID(),
        transcriptId: state.transcriptId,
        expectedRevision: state.revision,
        text: state.draft,
        reason: state.reason,
      };
    update(key, (s) => ({
      ...s,
      busy: true,
      correction: body,
      error: "",
      notice: "",
    }));
    try {
      const response = await command<{ saved: true; item: VoiceItem }>(
        endpoint,
        body,
      );
      if (!response.saved || !response.item)
        throw Error("未能確認儲存結果，請核對同一修正。");
      await cacheMutate<VoicePage>(
        startedUrl,
        (current) =>
          current
            ? {
                ...current,
                items: current.items.map((i) =>
                  i.id === item.id ? response.item : i,
                ),
              }
            : current,
        { revalidate: true },
      );
      update(key, (s) => ({
        ...s,
        busy: false,
        correction: null,
        editing: false,
        notice: "修正已儲存，原始逐字稿保留。",
      }));
      window.dispatchEvent(new Event("convelta:data-changed"));
    } catch (e) {
      update(key, (s) => ({
        ...s,
        busy: false,
        correction: known(e) ? null : body,
        error:
          e instanceof Error ? e.message : "結果未能確認，請核對同一修正。",
      }));
    }
  }
  function pickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    updateUpload(scope, (s) => ({
      ...s,
      file,
      requestId: file ? crypto.randomUUID() : "",
      pending: false,
      error:
        file && file.size > VOICE_MAX_BYTES ? "請選擇 4 MB 以內嘅語音。" : "",
      notice: "",
    }));
  }
  async function uploadAudio() {
    if (upload.busy || !upload.file || upload.file.size > VOICE_MAX_BYTES)
      return;
    const started = scope,
      startedUrl = url,
      form = new FormData();
    form.set("brandId", brandId);
    form.set("source", source);
    form.set("sourceId", sourceId);
    form.set("requestId", upload.requestId);
    form.set("file", upload.file);
    updateUpload(started, (s) => ({
      ...s,
      busy: true,
      pending: true,
      error: "",
      notice: "",
    }));
    try {
      const r = await command<{ item: VoiceItem }>(endpoint, form);
      if (!r.item) throw Error("未能確認語音保存結果，請核對同一上載。");
      await cacheMutate(startedUrl);
      updateUpload(started, (s) => ({
        ...s,
        busy: false,
        pending: false,
        file: null,
        requestId: "",
        notice: "語音已私密保存；按轉成文字先會開始轉錄。",
      }));
    } catch (e) {
      updateUpload(started, (s) => ({
        ...s,
        busy: false,
        pending: !known(e),
        error:
          e instanceof Error ? e.message : "未能確認上載，請核對同一請求。",
      }));
    }
  }
  return (
    <section
      className="voice-work"
      aria-label="語音與逐字稿"
      aria-busy={isLoading}
    >
      <header className="voice-head">
        <div>
          <span className="voice-symbol">
            <AudioLines size={17} />
          </span>
          <div>
            <h3>語音與逐字稿</h3>
            <p>對照原音，接住客人真正想講嘅需要。</p>
          </div>
        </div>
        <button
          type="button"
          className="voice-icon"
          aria-label="重新讀取語音"
          onClick={() => void refresh().catch(() => undefined)}
        >
          <RefreshCw size={15} className={isValidating ? "voice-spin" : ""} />
        </button>
      </header>
      {error && (
        <p className="voice-error" role="alert">
          {error.message}
        </p>
      )}
      {isLoading && (
        <p className="voice-muted" role="status">
          正在讀取語音…
        </p>
      )}
      {data?.blocker && (
        <p className="voice-capability" role="status">
          {data.blocker}
        </p>
      )}
      {data && !data.items.length && (
        <p className="voice-empty">
          未有可讀取嘅原音。收到語音後，就可以喺呢度播放同轉成文字。
        </p>
      )}
      {data?.items.map((item) => {
        const key = `${scope}:${item.id}`,
          state = states[key] ?? blank,
          transcript = item.transcript;
        return (
          <article className="voice-item" key={key}>
            <div className="voice-item-head">
              <span>
                <FileAudio size={15} />
                {item.origin === "staff_upload" ? "同事加入嘅語音" : "客人語音"}
              </span>
              <small>
                {item.durationSeconds
                  ? `${Math.ceil(item.durationSeconds)} 秒`
                  : item.createdAt
                    ? formatHongKongDateTime(item.createdAt)
                    : ""}
              </small>
            </div>
            {item.audioUrl && (
              <audio
                aria-label="播放原音"
                controls
                preload="none"
                src={item.audioUrl}
                onError={() =>
                  update(key, (s) => ({
                    ...s,
                    error: "原音暫時未能播放，請重新讀取語音後再試。",
                  }))
                }
              />
            )}
            {!item.available && (
              <p className="voice-muted">未能取得原音，暫時唔可以轉錄。</p>
            )}
            {state.error && (
              <p className="voice-error" role="alert">
                {state.error}
              </p>
            )}
            {state.notice && (
              <p className="voice-notice" role="status">
                {state.notice}
              </p>
            )}
            {!transcript && (
              <div className="voice-transcribe">
                <button
                  type="button"
                  className="voice-primary"
                  disabled={
                    state.busy || !data.canTranscribe || !item.available
                  }
                  onClick={() => void transcribe(item)}
                >
                  {state.busy ? (
                    <LoaderCircle size={15} className="voice-spin" />
                  ) : (
                    <AudioLines size={15} />
                  )}{" "}
                  {state.pending
                    ? "核對同一轉錄"
                    : item.status === "running"
                      ? "核對轉錄"
                      : "轉成文字"}
                </button>
                <small>
                  {item.status === "running"
                    ? "語音正在轉錄，未有結果前唔會猜測內容。"
                    : "支援廣東話及英文；按掣先開始分析。"}
                </small>
              </div>
            )}
            {transcript && (
              <VoiceTranscriptView
                transcript={transcript}
                state={state}
                canCorrect={data.canCorrect}
                update={(fn) => update(key, fn)}
                onSave={() => saveCorrection(item)}
              />
            )}
          </article>
        );
      })}
      {!messageId && data?.canCorrect && (
        <div className="voice-upload">
          <label>
            <Upload size={15} />
            加入原音
            <input
              key={`${scope}:${upload.requestId}`}
              aria-label="加入原音"
              type="file"
              accept={VOICE_MIME_TYPES.join(",")}
              disabled={upload.busy || upload.pending}
              onChange={pickFile}
            />
          </label>
          <span>4 MB／5 分鐘以內，私密保存於呢段對話。</span>
          {upload.file && (
            <div className="voice-upload-choice">
              <span>{upload.file.name}</span>
              <button
                type="button"
                className="voice-primary"
                disabled={upload.busy || upload.file.size > VOICE_MAX_BYTES}
                onClick={() => void uploadAudio()}
              >
                {upload.busy ? (
                  <LoaderCircle size={14} className="voice-spin" />
                ) : (
                  <Upload size={14} />
                )}{" "}
                {upload.pending ? "核對同一上載" : "保存原音"}
              </button>
              {!upload.pending && (
                <button
                  type="button"
                  className="voice-icon"
                  aria-label="取消已選語音"
                  disabled={upload.busy}
                  onClick={() =>
                    updateUpload(scope, (s) => ({
                      ...s,
                      file: null,
                      requestId: "",
                      error: "",
                    }))
                  }
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}
          {upload.error && (
            <p className="voice-error" role="alert">
              {upload.error}
            </p>
          )}
          {upload.notice && (
            <p className="voice-notice" role="status">
              {upload.notice}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
