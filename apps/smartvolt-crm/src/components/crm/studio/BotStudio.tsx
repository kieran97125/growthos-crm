"use client";
import { useIdentity } from "@/lib/saas/CompanyProvider";
import { useRef, useState } from "react";
import Link from "next/link";
import { canManage } from "@/lib/saas/identity";
import AIDraft from "@/components/ai/AIDraft";
import ReplyScenarios from "@/components/ai/ReplyScenarios";
import ResponseRules from "./ResponseRules";
import "@/components/ai/ai.css";
import {
  ArrowRight,
  BookOpen,
  Bot,
  Check,
  ChevronRight,
  Clock3,
  Hand,
  MessageSquare,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import { uid, actionTime } from "../conversations/events";
import { type BotProfile, type BrandId } from "./model";
import type { AssistantResult } from "./engine";
import { useAssistant } from "@/lib/demo/useAssistant";
import { AIConnectButton, useAIConnection } from "@/lib/demo/AIConnection";
import { AssistantResultCard } from "./AssistantResult";
import { StudioStatus } from "./StudioUI";
import type { StudioController } from "./useStudioStore";
import "./studio.css";
import BrandKnowledge from "@/components/website/BrandKnowledge";

const modes = [
  {
    id: "assist",
    title: "只提供建議",
    text: "由同事睇完、修改後傳送。",
    icon: Sparkles,
  },
  {
    id: "afterhours",
    title: "非辦公時間接待",
    text: "收集資料、回答指定常見問題。",
    icon: Clock3,
  },
  {
    id: "bounded",
    title: "指定範圍自動答",
    text: "限已授權知識，有需要即交真人。",
    icon: Bot,
  },
] as const;
type LabMessage = {
  id: string;
  from: "customer" | "bot" | "event";
  text: string;
};

export default function BotStudio({
  studio,
  onInbox,
  initialTab = "knowledge",
  initialBrand,
}: {
  studio: StudioController;
  onInbox: () => void;
  initialTab?: "settings" | "knowledge";
  initialBrand?: string;
}) {
  const identity = useIdentity();
  const BRANDS = identity.scope.brands;

  const { state, dispatch } = studio;
  const ai = useAssistant();
  const connection = useAIConnection();
  const [brandId, setBrandId] = useState<BrandId>(
    BRANDS.some((b) => b.id === initialBrand) ? initialBrand! : BRANDS[0].id,
  );
  const [tab, setTab] = useState<"settings" | "knowledge">(initialTab);
  const [labInput, setLabInput] = useState(
    identity.connected
      ? "我哋幾個同事分開覆 IG 同 Messenger，想集中管理查詢，有咩方案適合？"
      : "想了解舒緩護理嘅流程同收費。",
  );
  const [labMessages, setLabMessages] = useState<LabMessage[]>([]);
  const [result, setResult] = useState<AssistantResult | null>(null);
  const [withinWindow, setWithinWindow] = useState(true);
  const [businessHours, setBusinessHours] = useState(true);
  const [humanOwned, setHumanOwned] = useState(false);
  const [notice, setNotice] = useState("");
  const [labLocked, setLabLocked] = useState(false);
  const labRef = useRef<HTMLElement>(null);
  const editable = !identity.connected || canManage(identity.actor.role);
  const rulesDisabled = !editable || labLocked || studio.storageError;
  const saving =
    identity.connected && studio.storage !== "已儲存至公司工作空間";
  function chooseTrial(question: string) {
    if (labLocked) return;
    setLabInput(question);
    labRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  const profile = state.bots.find((b) => b.brandId === brandId)!;
  const articles = state.articles.filter((a) => a.brandId === brandId);
  const today = new Date(actionTime() + 8 * 3600000).toISOString().slice(0, 10);
  function patch(changes: Partial<BotProfile>) {
    if (rulesDisabled) return;
    const next = { ...profile, ...changes };
    if (next.openingHour >= next.closingHour) {
      setNotice("接待結束時間需要遲於開始時間。");
      return;
    }
    dispatch({ type: "bot", bot: { ...profile, ...changes } });
  }
  function changeBrand(value: BrandId) {
    if (labLocked) return;
    ai.cancel();
    setBrandId(value);
    setLabMessages([]);
    setResult(null);
    setHumanOwned(false);
    setLabInput(
      identity.connected
        ? "想了解公司嘅服務同適合我哋嘅方案。"
        : value === "nova-studio"
          ? "想了解舒緩護理嘅流程同收費。"
          : "肩頸服務幾錢？",
    );
  }
  async function runLab(demo = false) {
    if (!labInput.trim()) return;
    const answer = await ai.ask(
      {
        message: labInput,
        name: identity.connected ? "測試客戶" : "曉晴",
        brandId,
        profile,
        articles: state.articles,
        history: labMessages
          .filter((m) => m.from !== "event")
          .slice(-10)
          .map((m) => ({
            role:
              m.from === "customer"
                ? ("user" as const)
                : ("assistant" as const),
            content: m.text.slice(0, 1500),
          })),
        withinWindow,
        businessHours,
        humanOwned,
      },
      demo,
    );
    if (!answer) return;
    const list: LabMessage[] = [
      { id: uid(), from: "customer", text: labInput },
    ];
    if (answer.decision === "auto-demo")
      list.push({ id: uid(), from: "bot", text: answer.reply });
    else
      list.push({
        id: uid(),
        from: "event",
        text:
          answer.decision === "draft"
            ? "已準備建議回覆，等候同事確認。"
            : answer.reason,
      });
    if (answer.decision === "handoff") setHumanOwned(true);
    setLabMessages((current) => [...current, ...list].slice(-12));
    setResult(answer);
  }
  function takeOver(value: boolean) {
    setHumanOwned(value);
    setLabMessages((current) => [
      ...current,
      {
        id: uid(),
        from: "event",
        text: value
          ? "Mia 已接管此測試對話，BOT 暫停。"
          : "Mia 已將此測試對話交回 BOT。",
      },
    ]);
  }

  return (
    <section
      className={`st-workspace st-bot-workspace ${tab === "knowledge" ? "is-knowledge" : ""}`}
      aria-label="AI BOT 工作室"
    >
      <header className="st-page-header">
        <div className="st-page-heading">
          <span className="st-page-icon">
            <Bot size={24} />
          </span>
          <div>
            <h1>{tab === "knowledge" ? "品牌知識庫" : "BOT 回覆設定"}</h1>
          </div>
        </div>
        {tab === "settings" && (
          <div className="st-header-actions">
            {identity.connected ? (
              <span className="st-rules-save" role="status">
                {studio.storage ?? "正在核對儲存狀態…"}
              </span>
            ) : (
              <StudioStatus />
            )}
            <AIConnectButton />
          </div>
        )}
      </header>
      {tab === "settings" && (
        <aside className="st-bot-sidebar">
          <div className="st-library-title">
            <h2>品牌助手</h2>
            <Bot size={15} />
          </div>
          <div className="st-bot-profiles">
            {BRANDS.map((b, i) => (
              <button
                key={b.id}
                disabled={labLocked}
                className={brandId === b.id ? "is-active" : ""}
                onClick={() => changeBrand(b.id as BrandId)}
              >
                <span>{i === 0 ? "N" : "C"}</span>
                <div>
                  <strong>{b.name}</strong>
                  <small>獨立知識及回覆設定</small>
                </div>
                <ChevronRight size={13} />
              </button>
            ))}
          </div>
          <div className="st-bot-summary">
            <span className="st-neutral-chip">
              {identity.connected ? "品牌回應規則" : "示範設定"}
            </span>
            <strong>{profile.name}</strong>
            <p>{modes.find((m) => m.id === profile.mode)?.title}</p>
            <div>
              <span>可用知識</span>
              <b>
                {
                  articles.filter(
                    (a) => a.status === "approved" && a.validUntil >= today,
                  ).length
                }{" "}
                項
              </b>
            </div>
            <div>
              <span>接待時間</span>
              <b>
                {profile.openingHour}:00–{profile.closingHour}:00
              </b>
            </div>
          </div>
          <div className="st-rule-box st-bot-principle">
            <ShieldCheck size={17} />
            <h3>每個回答都有邊界</h3>
            <p>
              預約意向交 CS
              核實。價錢只引用有效資料；套票餘額、即時名額及收款狀態由同事確認。
            </p>
          </div>
          <button className="st-back-to-inbox" onClick={onInbox}>
            <MessageSquare size={15} />
            到收件匣試用 AI 建議
            <ArrowRight size={13} />
          </button>
        </aside>
      )}
      <div className="st-bot-editor">
        <nav className="st-tabs" aria-label="BOT 設定頁籤">
          <button
            className={tab === "settings" ? "is-active" : ""}
            aria-pressed={tab === "settings"}
            onClick={() => setTab("settings")}
          >
            <Bot size={16} />
            回覆設定
          </button>
          <button
            className={tab === "knowledge" ? "is-active" : ""}
            aria-pressed={tab === "knowledge"}
            onClick={() => setTab("knowledge")}
          >
            <BookOpen size={15} />
            品牌知識庫<span>{articles.length}</span>
          </button>
          {tab === "knowledge" && BRANDS.length > 1 && (
            <label className="kb-brand-label">
              品牌
              <select
                aria-label="知識庫品牌"
                value={brandId}
                onChange={(e) => changeBrand(e.target.value)}
              >
                {BRANDS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </nav>
        <div className="st-bot-editor-scroll">
          {tab === "settings" ? (
            <>
              {!editable && (
                <p className="st-rule-hint">
                  你可以檢視規則；修改需要公司管理員權限。
                </p>
              )}
              <ResponseRules
                profile={profile}
                patch={patch}
                disabled={rulesDisabled}
                onTry={chooseTrial}
              />
              <details className="st-rule-advanced">
                <summary>接待時段與流程設計</summary>
                <p>
                  {identity.connected
                    ? "公司訊息由同事確認後傳送；以下模式供流程設計。網站 C 喺網站聊天設定獨立啟用。"
                    : "喺示範對話測試不同接待模式。"}
                </p>
                <fieldset disabled={rulesDisabled}>
                  <legend>接待模式</legend>
                  <div
                    className="st-mode-options"
                    role="radiogroup"
                    aria-label="BOT 回覆模式"
                  >
                    {modes.map((m) => {
                      const Icon = m.icon;
                      return (
                        <button
                          type="button"
                          key={m.id}
                          role="radio"
                          aria-checked={profile.mode === m.id}
                          className={profile.mode === m.id ? "is-active" : ""}
                          onClick={() => patch({ mode: m.id })}
                        >
                          <span>
                            <Icon size={19} aria-hidden="true" />
                          </span>
                          <div>
                            <strong>{m.title}</strong>
                            <p>{m.text}</p>
                          </div>
                          <i>{profile.mode === m.id && <span />}</i>
                        </button>
                      );
                    })}
                  </div>
                  <div className="st-sim-inputs">
                    <label>
                      接待開始（香港時間）
                      <select
                        aria-label="接待開始時間"
                        value={profile.openingHour}
                        onChange={(e) =>
                          patch({ openingHour: Number(e.target.value) })
                        }
                      >
                        {Array.from({ length: 24 }, (_, h) => (
                          <option key={h} value={h}>
                            {String(h).padStart(2, "0")}:00
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      接待結束
                      <select
                        aria-label="接待結束時間"
                        value={profile.closingHour}
                        onChange={(e) =>
                          patch({ closingHour: Number(e.target.value) })
                        }
                      >
                        {Array.from({ length: 24 }, (_, i) => i + 1).map(
                          (h) => (
                            <option key={h} value={h}>
                              {String(h).padStart(2, "0")}:00
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                  </div>
                </fieldset>
              </details>
            </>
          ) : (
            <BrandKnowledge key={brandId} studio={studio} brandId={brandId} />
          )}
        </div>
        {tab === "settings" && (
          <footer className="st-editor-footer">
            <ShieldCheck size={12} />
            {studio.storage ??
              (studio.storageError
                ? "設定未能儲存，請保留頁面"
                : "此瀏覽器自動儲存")}
            <span>
              {identity.connected ? "已保存嘅規則先會用於真實試答" : "示範設定"}
            </span>
          </footer>
        )}
      </div>
      {tab === "settings" && identity.connected && (
        <aside
          ref={labRef}
          className="st-bot-lab st-connected-lab"
          aria-label="品牌回應試答"
        >
          <header>
            <div>
              <span>
                <Play size={14} aria-hidden="true" />
              </span>
              <h2>即時試答</h2>
            </div>
            <Link
              href={`/company/${identity.scope.companyId}/crm/ai?mode=replies&brand=${encodeURIComponent(brandId)}`}
            >
              完整試答
            </Link>
          </header>
          <div className="st-connected-trial">
            <p>使用已保存嘅品牌規則同有效知識。生成計入公司 AI 用量。</p>
            <ReplyScenarios
              message={labInput}
              disabled={labLocked}
              onChoose={setLabInput}
            />
            <label>
              客戶想問乜？
              <textarea
                aria-label="BOT 測試訊息"
                rows={4}
                maxLength={2000}
                disabled={labLocked}
                value={labInput}
                onChange={(e) => setLabInput(e.target.value)}
              />
            </label>
            {saving && (
              <p className="st-rule-hint">
                {studio.storageError
                  ? "請先核對未儲存改動，再試答。"
                  : "正在儲存規則，完成後可以試答。"}
              </p>
            )}
            <AIDraft
              key={`${brandId}:${JSON.stringify(profile)}`}
              view="test"
              context={{
                companyId: identity.scope.companyId,
                brandId,
                source: "playground",
                message: labInput,
              }}
              disabled={
                saving ||
                identity.actor.role === "viewer" ||
                connection.status !== "ready" ||
                !labInput.trim() ||
                !articles.some(
                  (a) =>
                    a.status === "approved" &&
                    a.validUntil >= today &&
                    a.coaching?.kind !== "pattern",
                )
              }
              onRequestState={setLabLocked}
            />
          </div>
        </aside>
      )}
      {tab === "settings" && !identity.connected && (
        <aside ref={labRef} className="st-bot-lab" aria-label="BOT 試聊測試">
          <header>
            <div>
              <span>
                <Play size={14} />
              </span>
              <h2>試聊測試</h2>
            </div>
            <button
              aria-label="清除測試對話"
              onClick={() => {
                setLabMessages([]);
                setResult(null);
                setHumanOwned(false);
              }}
            >
              <RotateIcon />
            </button>
          </header>
          <div className="st-lab-context">
            <span>以客戶身份試一次</span>
            <span className="st-lab-model-label">
              {connection.status === "ready" ? "AI 已啟用" : "可用示範引擎"}
            </span>
          </div>
          <div className="st-lab-conditions">
            <label>
              <input
                type="checkbox"
                checked={withinWindow}
                onChange={(e) => setWithinWindow(e.target.checked)}
              />
              客服窗口內
            </label>
            <label>
              <input
                type="checkbox"
                checked={businessHours}
                onChange={(e) => setBusinessHours(e.target.checked)}
              />
              營業時間內
            </label>
          </div>
          <div className="st-lab-chat">
            <div className="st-lab-welcome">
              <span>
                <Bot size={20} />
              </span>
              <strong>{profile.name}</strong>
              <p>{profile.greeting}</p>
            </div>
            {labMessages.map((m) => (
              <div key={m.id} className={`st-lab-message st-lab-${m.from}`}>
                {m.text}
              </div>
            ))}
          </div>
          <div className="st-lab-presets">
            <button onClick={() => setLabInput("想了解服務收費。")}>
              服務收費
            </button>
            <button onClick={() => setLabInput("星期六下午三點有冇位？")}>
              預約意向
            </button>
            <button onClick={() => setLabInput("我要退款，想搵真人處理。")}>
              真人交接
            </button>
          </div>
          <form
            className="st-lab-composer"
            onSubmit={(e) => {
              e.preventDefault();
              runLab();
            }}
          >
            <textarea
              aria-label="BOT 測試訊息"
              rows={2}
              maxLength={2000}
              value={labInput}
              onChange={(e) => setLabInput(e.target.value)}
              placeholder="輸入一個客戶問題…"
            />
            <button
              aria-label="試跑 BOT 回覆"
              type="submit"
              disabled={!labInput.trim() || ai.busy}
            >
              <Send size={15} />
            </button>
          </form>
          <div className="ai-lab-options">
            <button disabled={ai.busy} onClick={() => void runLab(true)}>
              使用示範引擎
            </button>
            {ai.busy && <span>AI 正在準備回覆…</span>}
            {ai.error && <p role="alert">{ai.error}</p>}
          </div>
          <div className="st-lab-takeover">
            <span>
              <span className={humanOwned ? "is-human" : ""} />
              {humanOwned ? "真人已接管" : "跟隨回覆設定"}
            </span>
            <button onClick={() => takeOver(!humanOwned)}>
              <Hand size={12} />
              {humanOwned ? "交回 BOT" : "由我接管"}
            </button>
          </div>
          {result && (
            <div className="st-lab-result">
              <AssistantResultCard result={result} />
            </div>
          )}
          <footer>
            AI 經伺服器處理；回覆只會進入 Demo 對話，不會發送至 WhatsApp。
          </footer>
        </aside>
      )}
      {notice && (
        <div className="st-notice" role="status">
          <Check size={14} />
          {notice}
          <button aria-label="關閉 BOT 提示" onClick={() => setNotice("")}>
            <X size={13} />
          </button>
        </div>
      )}
    </section>
  );
}
function RotateIcon() {
  return (
    <svg
      aria-hidden="true"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <path d="M3 11a9 9 0 1 1 2 7M3 4v7h7" />
    </svg>
  );
}
