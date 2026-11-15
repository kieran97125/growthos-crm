"use client";
import { useState } from "react";
import { LoaderCircle, MessageSquare, Sparkles } from "lucide-react";
import { Modal } from "../conversations/WorkspacePrimitives";
import type { Contact, Conversation, Message } from "../conversations/model";
import type { StudioController } from "./useStudioStore";
import { AssistantResultCard } from "./AssistantResult";
import type { BrandId } from "./model";
import type { LiveAnswer } from "@/lib/demo/ai-contract";
import { AIConnectButton } from "@/lib/demo/AIConnection";
import { useAssistant } from "@/lib/demo/useAssistant";
import { useIdentity } from "@/lib/saas/CompanyProvider";
import CoachPanel from "@/components/coaching/CoachPanel";
export function AssistantDialog({
  studio,
  contact,
  conversation,
  messages,
  now,
  onInsert,
  onFollowUp,
  onClose,
  currentDraft,
}: {
  studio: StudioController;
  contact: Contact;
  conversation: Conversation;
  messages: Message[];
  now: number;
  onInsert: (text: string) => void;
  onFollowUp: () => void;
  onClose: () => void;
  currentDraft?: string;
}) {
  const identity = useIdentity();
  const [coachOpen, setCoachOpen] = useState(false);
  const [result, setResult] = useState<LiveAnswer | null>(null),
    ai = useAssistant();
  const last = [...messages].reverse().find((m) => m.kind === "incoming"),
    profile = studio.state.bots.find((b) => b.brandId === conversation.brandId);
  async function run(demo = false) {
    if (!last || !profile) return;
    const answer = await ai.ask(
      {
        message: last.body,
        name: contact.name,
        brandId: conversation.brandId as BrandId,
        profile,
        articles: studio.state.articles,
        history: messages
          .filter((m) => m.kind === "incoming" || m.kind === "outgoing")
          .slice(-10, -1)
          .map((m) => ({
            role:
              m.kind === "incoming"
                ? ("user" as const)
                : ("assistant" as const),
            content: m.body.slice(0, 1500),
          })),
        withinWindow: Date.now() - last.at < 86400000,
        humanOwned: !!conversation.owner,
        businessHours: true,
        assist: true,
      },
      demo,
      { conversationId: conversation.id },
    );
    if (answer) setResult(answer);
  }
  return (
    <Modal
      title="AI 回覆助手"
      subtitle="參考目前對話、客戶已提供資料同有效品牌知識。"
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
        <div className="ai-copilot-info">
          <p>
            AI 會讀取呢段對話同品牌知識庫，唔包括內部備註。建議由你修改後傳送。
          </p>
          <AIConnectButton />
        </div>
        <div className="ai-request-actions">
          <button
            className="st-button st-primary"
            disabled={!last || !profile || ai.busy}
            onClick={() => void run()}
          >
            {ai.busy ? (
              <LoaderCircle size={15} className="ai-spin" />
            ) : (
              <Sparkles size={15} />
            )}
            準備 AI 回覆建議
          </button>
          <button
            className="st-button"
            disabled={ai.busy}
            onClick={() => void run(true)}
          >
            使用示範引擎
          </button>
        </div>
        {ai.error && (
          <p className="ai-error" role="alert">
            {ai.error}
          </p>
        )}
        {result && (
          <AssistantResultCard
            result={result}
            onInsert={onInsert}
            onFollowUp={onFollowUp}
          />
        )}
        <small className="st-small-note">
          對話時間：
          {new Intl.DateTimeFormat("zh-HK", {
            timeZone: "Asia/Hong_Kong",
            dateStyle: "short",
            timeStyle: "short",
          }).format(now)}
        </small>
        {identity.connected && (
          <details
            className="coach-inline-disclosure"
            onToggle={(event) => setCoachOpen(event.currentTarget.open)}
          >
            <summary>
              <Sparkles size={14} aria-hidden="true" />
              AI 客服教練
            </summary>
            {coachOpen && (
              <CoachPanel
                companyId={identity.scope.companyId}
                brandId={conversation.brandId}
                source="conversation"
                sourceId={conversation.id}
                currentDraft={currentDraft}
                disabled={identity.actor.role === "viewer"}
                onInsert={onInsert}
              />
            )}
          </details>
        )}
      </div>
    </Modal>
  );
}
