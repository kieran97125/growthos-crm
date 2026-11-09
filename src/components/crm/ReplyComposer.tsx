"use client";

import { useRef, useState } from "react";
import { Check, Copy, MessageSquareText, Send } from "lucide-react";
import { quickReplies, renderReply } from "@/lib/crm/operations";

export function ReplyComposer({
  customerName,
  treatment,
}: {
  customerName: string;
  treatment: string;
}) {
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const insert = (reply: (typeof quickReplies)[number]) => {
    const rendered = renderReply(reply.body, {
      customer_name: customerName,
      treatment,
    });
    setDraft(rendered.body);
    setCopied(false);
    setNotice(
      rendered.complete
        ? "已帶入客戶資料，請檢查內容。"
        : `仍需填寫：${rendered.missing.join("、")}`,
    );
    textarea.current?.focus();
  };
  const copy = async () => {
    const rendered = renderReply(draft, {});
    if (!rendered.complete) {
      setNotice("請先填好全部 {{變數}} 再複製。");
      return;
    }
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setNotice("回覆已複製，可貼到你嘅對話中。");
    } catch {
      textarea.current?.focus();
      textarea.current?.select();
      setNotice("請按複製快捷鍵，複製已選取嘅回覆。");
    }
  };
  return (
    <section className="ops-card ops-composer" aria-label="預存回覆草稿">
      <div className="ops-card-title">
        <div className="ops-title-icon">
          <MessageSquareText size={18} />
          <h2>回覆草稿</h2>
        </div>
        <span className="ops-badge">預存回覆</span>
      </div>
      <p className="ops-muted">
        選擇回覆、修改內容，再複製到對話。草稿只保留喺本頁。
      </p>
      <div className="ops-chip-row">
        {quickReplies.map((reply) => (
          <button
            key={reply.id}
            className="ops-button"
            onClick={() => insert(reply)}
          >
            {reply.title}
          </button>
        ))}
      </div>
      <label className="ops-field">
        <span>回覆內容</span>
        <textarea
          ref={textarea}
          value={draft}
          maxLength={4000}
          rows={5}
          placeholder="輸入回覆，或先選擇預存回覆⋯"
          onChange={(event) => {
            setDraft(event.target.value);
            setCopied(false);
            setNotice("");
          }}
        />
      </label>
      <div className="ops-composer-footer">
        <span className="ops-muted">尚未連接傳訊渠道</span>
        <div className="ops-header-actions">
          <button
            className="ops-button"
            disabled={!draft.trim()}
            onClick={copy}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}複製回覆
          </button>
          <button
            className="ops-button ops-button-primary"
            disabled
            title="接通並驗證獨立 WhatsApp 渠道後先可發送"
          >
            <Send size={14} />
            傳送
          </button>
        </div>
      </div>
      <p className="ops-muted" role="status">
        {notice || "預存回覆由團隊編寫，未使用 AI 生成。"}
      </p>
    </section>
  );
}
