"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Languages, RotateCcw, LoaderCircle, X } from "lucide-react";
import {
  detectLanguage,
  languageLabels,
  targets,
  type TranslationScope,
  type TranslationTarget,
} from "@/lib/translation/model";
import { requestTranslation } from "@/lib/translation/client";

type Common = { scope: TranslationScope; disabled?: boolean; demo?: boolean };
function TargetButtons({
  busy,
  disabled,
  translate,
  message = false,
}: {
  busy: TranslationTarget | null;
  disabled?: boolean;
  translate: (target: TranslationTarget) => void;
  message?: boolean;
}) {
  return (
    <>
      {(Object.keys(targets) as TranslationTarget[]).map((target) => (
        <button
          key={target}
          type="button"
          className="cv-tr-target"
          disabled={disabled || !!busy}
          aria-label={`將${message ? "客戶訊息" : "草稿"}翻譯成${target === "en" ? "英文" : "繁中"}`}
          title="翻譯會計入公司 AI 用量"
          onClick={() => translate(target)}
        >
          {busy === target && (
            <LoaderCircle size={12} className="cv-tr-spin" aria-hidden="true" />
          )}
          {targets[target]}
        </button>
      ))}
    </>
  );
}

export function MessageTranslation({
  scope,
  text,
  messageId,
  disabled,
  demo,
}: Common & { text: string; messageId: string }) {
  const [busy, setBusy] = useState<TranslationTarget | null>(null),
    [error, setError] = useState("");
  const [translation, setTranslation] = useState<{
    text: string;
    target: TranslationTarget;
  } | null>(null);
  const [visible, setVisible] = useState(true);
  const mounted = useRef(false),
    active = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  if (
    !text.trim() ||
    text === "[附件／分享內容：請於原生平台查看]" ||
    text.length > 6000 ||
    !/[\p{L}]/u.test(text)
  )
    return null;
  async function translate(target: TranslationTarget) {
    if (active.current || disabled) return;
    if (demo) {
      setError("登入公司工作空間後即可使用翻譯。");
      return;
    }
    active.current = true;
    setBusy(target);
    setError("");
    try {
      const result = await requestTranslation(
        {
          ...scope,
          mode: "message",
          messageId,
          target,
        },
        text,
      );
      if (mounted.current) {
        setTranslation(result);
        setVisible(true);
      }
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "翻譯未完成，請再試。");
    } finally {
      active.current = false;
      if (mounted.current) setBusy(null);
    }
  }
  return (
    <div className="cv-translation cv-tr-message">
      <div className="cv-tr-toolbar">
        <span className="cv-tr-language">
          <Languages size={13} aria-hidden="true" />
          {languageLabels[detectLanguage(text)]}
        </span>
        <TargetButtons
          busy={busy}
          disabled={disabled}
          translate={translate}
          message
        />
        {translation && (
          <button
            className="cv-tr-toggle"
            type="button"
            aria-expanded={visible}
            onClick={() => setVisible(!visible)}
          >
            {visible ? "收起譯文" : "顯示譯文"}
          </button>
        )}
      </div>
      {error && (
        <p className="cv-tr-error" role="alert">
          {error}
        </p>
      )}
      {translation && visible && (
        <div className="cv-tr-result" role="status" aria-label="客戶訊息譯文">
          <span>{targets[translation.target]}譯文</span>
          <p lang={translation.target}>{translation.text}</p>
        </div>
      )}
    </div>
  );
}

export function DraftTranslation({
  scope,
  value,
  onChange,
  maxLength,
  disabled,
  demo,
}: Common & {
  value: string;
  onChange: (text: string) => void;
  maxLength: number;
}) {
  const [busy, setBusy] = useState<TranslationTarget | null>(null),
    [error, setError] = useState("");
  const [undo, setUndo] = useState<{
    original: string;
    translated: string;
  } | null>(null);
  const [candidate, setCandidate] = useState<{
    text: string;
    original: string;
    target: TranslationTarget;
  } | null>(null);
  const latest = useRef({ value, onChange, disabled, maxLength });
  useLayoutEffect(() => {
    latest.current = { value, onChange, disabled, maxLength };
  }, [value, onChange, disabled, maxLength]);
  const mounted = useRef(false),
    active = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function translate(target: TranslationTarget) {
    if (active.current || disabled || !value.trim()) return;
    if (demo) {
      setError("登入公司工作空間後即可使用翻譯。");
      return;
    }
    const original = value;
    active.current = true;
    setBusy(target);
    setError("");
    setCandidate(null);
    try {
      const result = await requestTranslation({
        ...scope,
        mode: "draft",
        text: original,
        target,
      });
      if (!mounted.current) return;
      const current = latest.current;
      if (
        current.value === original &&
        !current.disabled &&
        result.text.length <= current.maxLength
      ) {
        current.onChange(result.text);
        setUndo({ original, translated: result.text });
      } else setCandidate({ ...result, original });
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "翻譯未完成，原文仍然保留。");
    } finally {
      active.current = false;
      if (mounted.current) setBusy(null);
    }
  }
  return (
    <div className="cv-translation cv-tr-draft" aria-label="草稿翻譯">
      <div className="cv-tr-toolbar">
        <span className="cv-tr-language">
          <Languages size={14} aria-hidden="true" />
          翻譯成
        </span>
        <TargetButtons
          busy={busy}
          disabled={disabled || !value.trim() || value.length > 6000}
          translate={translate}
        />
        {undo && value === undo.translated && (
          <button
            type="button"
            className="cv-tr-undo"
            disabled={disabled || !!busy}
            onClick={() => {
              onChange(undo.original);
              setUndo(null);
            }}
          >
            <RotateCcw size={12} aria-hidden="true" />
            還原原文
          </button>
        )}
        {busy && (
          <span className="cv-tr-progress" role="status">
            翻譯中…
          </span>
        )}
      </div>
      {error && (
        <p className="cv-tr-error" role="alert">
          {error}
        </p>
      )}
      {candidate && (
        <div className="cv-tr-result" role="status" aria-label="待套用草稿譯文">
          <header>
            <span>
              {candidate.text.length > maxLength
                ? "譯文超出此渠道字數，請複製後縮短。"
                : "你已修改草稿，譯文保留喺下面。"}
            </span>
            <button
              type="button"
              className="cv-tr-close"
              aria-label="收起草稿譯文"
              onClick={() => setCandidate(null)}
            >
              <X size={14} />
            </button>
          </header>
          <p lang={candidate.target}>{candidate.text}</p>
          <div className="cv-tr-result-actions">
            <button
              type="button"
              className="cv-tr-target"
              onClick={() => {
                void navigator.clipboard
                  .writeText(candidate.text)
                  .catch(() => setError("未能複製，請選取譯文自行複製。"));
              }}
            >
              複製譯文
            </button>
            <button
              type="button"
              className="cv-tr-target"
              disabled={disabled || candidate.text.length > maxLength}
              onClick={() => {
                setUndo({ original: value, translated: candidate.text });
                onChange(candidate.text);
                setCandidate(null);
              }}
            >
              以譯文取代草稿
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
