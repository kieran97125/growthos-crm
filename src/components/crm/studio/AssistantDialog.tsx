"use client";
import { useState } from "react";
import { Bot, MessageSquare, Play, Sparkles } from "lucide-react";
import { Modal } from "../conversations/WorkspacePrimitives";
import type { Contact, Conversation, Message } from "../conversations/model";
import type { StudioController } from "./useStudioStore";
import { suggestReply, type AssistantResult } from "./engine";
import { AssistantResultCard } from "./AssistantResult";
import type { BrandId } from "./model";
import "./studio.css";
export function AssistantDialog({
  studio,
  contact,
  conversation,
  messages,
  now,
  onInsert,
  onFollowUp,
  onClose,
}: {
  studio: StudioController;
  contact: Contact;
  conversation: Conversation;
  messages: Message[];
  now: number;
  onInsert: (text: string) => void;
  onFollowUp: () => void;
  onClose: () => void;
}) {
  const [result, setResult] = useState<AssistantResult | null>(null);
  const last = [...messages].reverse().find((m) => m.kind === "incoming");
  const profile = studio.state.bots.find(
    (b) => b.brandId === conversation.brandId,
  );
  return (
    <Modal
      title="AI 回覆助手"
      subtitle="根據目前客戶、對話及有效品牌知識準備建議。"
      onClose={onClose}
    >
      <div className="st-copilot">
        <div className="st-copilot-context">
          <span>
            <MessageSquare size={17} />
          </span>
          <div>
            <strong>{contact.name} 最新來訊</strong>
            <p>{last?.body ?? "未有客戶訊息"}</p>
          </div>
        </div>
        <div className="st-copilot-disclosure">
          <Bot size={15} />
          <p>
            目前為示範回覆引擎，尚未接通真實 AI 模型。所有建議由你確認後傳送。
          </p>
        </div>
        <button
          className="st-button st-primary st-full"
          disabled={!last || !profile}
          onClick={() => {
            if (!last || !profile) return;
            setResult(
              suggestReply({
                message: last.body,
                name: contact.name,
                brandId: conversation.brandId as BrandId,
                profile,
                articles: studio.state.articles,
                now,
                withinWindow: now - last.at < 86400000,
                humanOwned: !!conversation.owner,
                businessHours: true,
                assist: true,
              }),
            );
          }}
        >
          <Sparkles size={15} />
          準備回覆建議
          <Play size={12} />
        </button>
        {result && (
          <AssistantResultCard
            result={result}
            onInsert={onInsert}
            onFollowUp={onFollowUp}
          />
        )}
      </div>
    </Modal>
  );
}
