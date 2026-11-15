import {
  Check,
  ChevronDown,
  History,
  LoaderCircle,
  PencilLine,
  Save,
} from "lucide-react";
import type { VoiceTranscript } from "@/lib/voice/model";
import { formatHongKongDateTime } from "@/lib/datetime";
import type { ItemState } from "./types";
const languageNames = {
  cantonese: "廣東話",
  english: "English",
  mixed: "粵英混合",
  other: "原文",
};
export default function VoiceTranscriptView({
  transcript,
  state,
  canCorrect,
  update,
  onSave,
}: {
  transcript: VoiceTranscript;
  state: ItemState;
  canCorrect: boolean;
  update: (fn: (old: ItemState) => ItemState) => void;
  onSave: () => Promise<void>;
}) {
  return (
    <>
      <div className="voice-transcript-head">
        <strong>逐字稿</strong>
        <div>
          <span>{languageNames[transcript.language]}</span>
          {transcript.corrected && (
            <span className="voice-corrected">
              <Check size={11} />
              已修正
            </span>
          )}
          {canCorrect && !state.editing && (
            <button
              type="button"
              onClick={() =>
                update((s) => ({
                  ...s,
                  editing: true,
                  draft: s.draft || transcript.text,
                  reason: s.reason || "",
                  transcriptId: transcript.id,
                  revision:
                    s.transcriptId === transcript.id && s.draft
                      ? s.revision
                      : transcript.revision,
                  error: "",
                  notice: "",
                }))
              }
            >
              <PencilLine size={13} />
              修正逐字稿
            </button>
          )}
        </div>
      </div>
      {state.editing ? (
        <div className="voice-editor">
          <label>
            逐字稿內容
            <textarea
              aria-label="逐字稿內容"
              rows={6}
              maxLength={12000}
              value={state.draft}
              disabled={state.busy || !!state.correction || !canCorrect}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  draft: e.target.value,
                  error: "",
                }))
              }
            />
          </label>
          <label>
            修正原因
            <input
              aria-label="修正原因"
              maxLength={500}
              placeholder="例如：核對原音後修正服務名稱"
              value={state.reason}
              disabled={state.busy || !!state.correction || !canCorrect}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  reason: e.target.value,
                  error: "",
                }))
              }
            />
          </label>
          {transcript.revision !== state.revision && !state.correction && (
            <div className="voice-error" role="alert">
              <p>
                逐字稿已由其他同事更新。你嘅草稿保留喺上面，請核對最新內容。
              </p>
              <p className="voice-transcript">{transcript.text}</p>
              <button
                type="button"
                disabled={!canCorrect}
                onClick={() =>
                  update((s) => ({
                    ...s,
                    revision: transcript.revision,
                  }))
                }
              >
                已核對，保留草稿繼續修正
              </button>
            </div>
          )}
          <div className="voice-editor-actions">
            <button
              type="button"
              disabled={state.busy}
              onClick={() => update((s) => ({ ...s, editing: false }))}
            >
              收起草稿
            </button>
            <button
              type="button"
              className="voice-primary"
              disabled={
                state.busy ||
                !canCorrect ||
                (!state.correction &&
                  (!state.draft.trim() ||
                    !state.reason.trim() ||
                    transcript.revision !== state.revision))
              }
              onClick={() => void onSave()}
            >
              {state.busy ? (
                <LoaderCircle size={14} className="voice-spin" />
              ) : (
                <Save size={14} />
              )}{" "}
              {state.correction ? "核對同一修正" : "儲存修正"}
            </button>
          </div>
        </div>
      ) : (
        <p className="voice-transcript">{transcript.text}</p>
      )}
      {!!transcript.extractions.length && (
        <div className="voice-extractions">
          <h4>客人提及</h4>
          {transcript.extractions.map((e, i) => (
            <div key={`${e.kind}:${i}`}>
              <span>{e.kind === "date" ? "期望時間" : "需要"}</span>
              <p>{e.text}</p>
              <details>
                <summary>
                  查看原句
                  <ChevronDown size={11} />
                </summary>
                <blockquote>{e.quote}</blockquote>
              </details>
            </div>
          ))}
          <small>時間同需要係客人提出嘅意向，仍需同事核實安排。</small>
        </div>
      )}
      <details className="voice-history">
        <summary>
          <History size={13} />
          {transcript.corrected ? "原文與修正記錄" : "查看原文"}
          <ChevronDown size={12} />
        </summary>
        <div>
          <strong>原始逐字稿</strong>
          <p>{transcript.originalText}</p>
          {transcript.history.map((h) => (
            <article key={h.revision}>
              <span>
                v{h.revision} · {formatHongKongDateTime(h.createdAt)}
              </span>
              <p>{h.text}</p>
              <small>{h.reason}</small>
            </article>
          ))}
        </div>
      </details>
    </>
  );
}
