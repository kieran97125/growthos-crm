"use client";
import { useState } from "react";
import {
  ArrowRight,
  BellRing,
  Bot,
  Check,
  ChevronLeft,
  FileText,
  Hand,
  LoaderCircle,
  MessageSquare,
  Send,
  Sparkles,
} from "lucide-react";
import { useDemo } from "@/lib/demo/Provider";
import { useAssistant } from "@/lib/demo/useAssistant";
import { AIConnectButton } from "@/lib/demo/AIConnection";
import { BRANDS } from "../conversations/model";
import { Modal } from "../conversations/WorkspacePrimitives";
import { uid, actionTime } from "../conversations/events";
import { DEFAULT_SIMULATION, simulateFlow } from "./engine";
import type { BrandId } from "./model";
import type { LiveAnswer } from "@/lib/demo/ai-contract";
import { AssistantResultCard } from "./AssistantResult";
import "./experience.css";
export default function DemoExperience({
  onInbox,
  onBroadcast,
}: {
  onInbox: (id: string) => void;
  onBroadcast: () => void;
}) {
  const d = useDemo(),
    ai = useAssistant();
  const [selected, setSelected] = useState("c1"),
    [input, setInput] = useState("想了解服務嘅流程同收費。"),
    [form, setForm] = useState(false),
    [notice, setNotice] = useState(""),
    [answer, setAnswer] = useState<LiveAnswer | null>(null),
    [checked, setChecked] = useState(false),
    [consent, setConsent] = useState(true),
    [approved, setApproved] = useState(true),
    [fee, setFee] = useState("HK$480");
  const r = d.state.broadcasts.recipients.find(
      (r) => r.id === d.state.broadcasts.activeRecipientId,
    ),
    cv =
      d.state.inbox.conversations.find(
        (c) => c.id === (r?.conversationId ?? selected),
      ) ?? d.state.inbox.conversations[0],
    person = d.state.inbox.contacts.find((p) => p.id === cv.contactId)!,
    brand = BRANDS.find((b) => b.id === cv.brandId)!,
    profile = d.state.studio.bots.find((b) => b.brandId === cv.brandId)!,
    flow =
      d.state.studio.flows.find(
        (f) =>
          f.brandId === cv.brandId && f.nodes.some((n) => n.kind === "form"),
      ) ?? d.state.studio.flows.find((f) => f.brandId === cv.brandId),
    messages = d.state.inbox.messages.filter(
      (m) =>
        m.conversationId === cv.id && ["incoming", "outgoing"].includes(m.kind),
    ),
    booking = d.state.inbox.bookings
      .toReversed()
      .find((b) => b.conversationId === cv.id && b.status !== "cancelled"),
    campaign = d.state.broadcasts.campaigns.find((c) => c.id === r?.campaignId);
  async function reply(body: string, demo = false, assist = false) {
    if (cv.owner && !assist) {
      setNotice("同事已接管，BOT 暫停自動回覆。");
      return;
    }
    const result = await ai.ask(
      {
        message: body,
        name: person.name,
        brandId: cv.brandId as BrandId,
        profile,
        articles: d.state.studio.articles,
        history: messages.slice(-10).map((m) => ({
          role:
            m.kind === "incoming" ? ("user" as const) : ("assistant" as const),
          content: m.body.slice(0, 1500),
        })),
        withinWindow: true,
        humanOwned: !!cv.owner,
        businessHours: true,
        assist: assist || profile.mode === "assist",
      },
      demo,
    );
    if (!result) return;
    setAnswer(result);
    if (result.decision === "auto-demo" && result.reply)
      d.dispatch({
        type: "inbox",
        action: {
          type: "message",
          conversationId: cv.id,
          message: {
            id: uid(),
            conversationId: cv.id,
            kind: "outgoing",
            body: result.reply,
            author: profile.name,
            at: actionTime(),
            replyTo: null,
          },
        },
      });
    if (result.decision === "handoff")
      d.dispatch({
        type: "inbox",
        action: {
          type: "assign",
          conversationId: cv.id,
          owner: "me",
          at: actionTime(),
          eventId: uid(),
        },
      });
  }
  async function send() {
    if (!input.trim() || ai.busy) return;
    const body = input.trim();
    d.dispatch({
      type: "customer-message",
      conversationId: cv.id,
      body,
      id: uid(),
      at: actionTime(),
      recipientId: r?.id,
    });
    setInput("");
    if (/(^stop$|退訂|取消訂閱|唔好再send|唔想再收)/i.test(body)) {
      setNotice("已記錄退訂，後續推播會排除此客戶。");
      return;
    }
    if (profile.mode !== "assist" && !cv.owner) await reply(body);
    else
      setNotice(
        cv.owner
          ? "客戶訊息已進入收件匣，由同事處理。"
          : "客戶訊息已進入收件匣，可以用 AI 建議準備草稿。",
      );
  }
  function verify() {
    if (!booking || !checked || !fee.trim()) return;
    d.dispatch({
      type: "inbox",
      action: {
        type: "booking",
        booking: { ...booking, status: "confirmed", fee },
        at: actionTime(),
        eventId: uid(),
      },
    });
    setNotice("同事核實已記錄，可以繼續提醒體驗。");
  }
  function reminder() {
    if (
      !booking ||
      booking.status !== "confirmed" ||
      !booking.fee?.trim() ||
      !flow
    ) {
      setNotice("請先核實預約同費用安排。");
      return;
    }
    const due = Date.parse(`${booking.date}T10:00:00+08:00`) - 86400000;
    if (!Number.isFinite(due) || due < actionTime()) {
      setNotice("提醒時間已過，請先更新預約日期。");
      return;
    }
    const result = simulateFlow(flow, {
      ...DEFAULT_SIMULATION,
      intent: "booking",
      manualVerified: true,
      consent,
      templateApproved: approved,
      fields: {
        name: person.name,
        service: booking.service,
        fee: booking.fee,
        branch: booking.branch,
        date: booking.date,
        time: booking.time,
      },
    });
    const step = result.steps.at(-1);
    if (result.issues.length || step?.state !== "completed" || !step.preview) {
      setNotice(result.issues[0] ?? step?.detail ?? "流程未到達提醒節點。");
      return;
    }
    const id = `reminder:${booking.id}:${booking.date}:${booking.time}`;
    if (d.state.inbox.messages.some((m) => m.id === id)) {
      setNotice("呢個預約版本已體驗過提醒，不會重複加入訊息。");
      return;
    }
    d.dispatch({
      type: "inbox",
      action: {
        type: "message",
        conversationId: cv.id,
        message: {
          id,
          conversationId: cv.id,
          kind: "outgoing",
          body: step.preview,
          author: "提醒範本 · 示範",
          at: actionTime(),
          replyTo: null,
        },
      },
    });
    setNotice("已模擬到提醒時間，範本訊息已加入體驗對話。沒有建立真實排程。");
  }
  const due = booking
    ? new Intl.DateTimeFormat("zh-HK", {
        timeZone: "Asia/Hong_Kong",
        dateStyle: "short",
        timeStyle: "short",
      }).format(Date.parse(`${booking.date}T10:00:00+08:00`) - 86400000)
    : "";
  return (
    <section className="xp-workspace st-workspace" aria-label="Demo 體驗中心">
      <header className="xp-header">
        <div>
          <span className="bc-eyebrow">THE COMPLETE CUSTOMER JOURNEY</span>
          <h1>
            體驗中心 <span>客戶與客服，同一個流程。</span>
          </h1>
        </div>
        <AIConnectButton />
      </header>
      <div className="xp-scroll">
        <div className="xp-intro">
          <span>
            <Sparkles size={21} />
          </span>
          <div>
            <h2>先用客戶身份試一次</h2>
            <p>
              發訊息或填預約意向，再切去客服核實。推播來源同回覆成效會連動更新。
            </p>
          </div>
          <button className="bc-button" onClick={onBroadcast}>
            推播與成效
            <ArrowRight size={14} />
          </button>
        </div>
        <div className="xp-grid">
          <div className="xp-customer">
            <label>
              體驗客戶
              <select
                aria-label="體驗客戶"
                value={cv.id}
                onChange={(e) => {
                  ai.cancel();
                  setSelected(e.target.value);
                  d.dispatch({ type: "active-recipient", id: null });
                  setAnswer(null);
                  setNotice("");
                  setChecked(false);
                }}
              >
                {d.state.inbox.conversations.map((c) => (
                  <option value={c.id} key={c.id}>
                    {
                      d.state.inbox.contacts.find((p) => p.id === c.contactId)
                        ?.name
                    }{" "}
                    · {BRANDS.find((b) => b.id === c.brandId)?.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="xp-phone">
              <header>
                <ChevronLeft size={18} />
                <span className="xp-phone-avatar">N</span>
                <div>
                  <strong>{brand.name}</strong>
                  <small>
                    {cv.owner
                      ? "同事接待中"
                      : profile.mode === "assist"
                        ? "客服回覆建議模式"
                        : "BOT 接待中"}
                  </small>
                </div>
                <span className="xp-channel-label">Demo</span>
              </header>
              <div
                className="xp-messages"
                tabIndex={0}
                role="log"
                aria-label="客戶體驗對話"
              >
                <small>測試 WhatsApp 對話 · 未連接真實號碼</small>
                {messages.slice(-10).map((m) => (
                  <article
                    key={m.id}
                    className={
                      m.kind === "incoming"
                        ? "xp-message-customer"
                        : "xp-message-business"
                    }
                  >
                    <p>{m.body}</p>
                    <span>
                      {new Intl.DateTimeFormat("zh-HK", {
                        timeZone: "Asia/Hong_Kong",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      }).format(m.at)}
                    </span>
                  </article>
                ))}
              </div>
              <div className="xp-phone-actions">
                <button onClick={() => setForm(true)}>
                  <FileText size={14} />
                  填預約意向
                </button>
                <button onClick={() => setInput("我要搵真人跟進。")}>
                  搵真人
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <input
                  aria-label="客戶體驗訊息"
                  maxLength={2000}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="以客戶身份輸入訊息…"
                />
                <button
                  type="submit"
                  aria-label="傳送客戶體驗訊息"
                  disabled={ai.busy || !input.trim()}
                >
                  {ai.busy ? (
                    <LoaderCircle size={17} className="ai-spin" />
                  ) : (
                    <Send size={17} />
                  )}
                </button>
              </form>
            </div>
            {campaign && (
              <div className="xp-campaign-source">
                <Send size={14} />
                <span>推播來源：{campaign.name}</span>
              </div>
            )}
          </div>
          <div className="xp-operations">
            <div className="xp-operation-header">
              <span>
                <MessageSquare size={18} />
              </span>
              <div>
                <h2>客服接手區</h2>
                <p>實際改動會同步去收件匣及推播成效。</p>
              </div>
            </div>
            <div className="xp-mode">
              <Bot size={16} />
              <div>
                <strong>{profile.name}</strong>
                <p>
                  {profile.mode === "assist"
                    ? "只提供建議，由同事確認後傳送。"
                    : profile.mode === "bounded"
                      ? "指定知識範圍自動答；無依據就轉真人。"
                      : "非辦公時間接待；體驗時可到 BOT 工作室切換時間條件。"}
                </p>
              </div>
              <button
                onClick={() =>
                  d.dispatch({
                    type: "inbox",
                    action: {
                      type: "assign",
                      conversationId: cv.id,
                      owner: cv.owner ? null : "me",
                      at: actionTime(),
                      eventId: uid(),
                    },
                  })
                }
              >
                <Hand size={13} />
                {cv.owner ? "交回 BOT" : "真人接管"}
              </button>
            </div>
            <button
              className="bc-button bc-primary xp-full"
              onClick={() => onInbox(cv.id)}
            >
              開啟客服收件匣
              <ArrowRight size={14} />
            </button>
            <button
              className="bc-button xp-full"
              style={{ marginTop: 10 }}
              disabled={ai.busy}
              onClick={() =>
                void reply(
                  messages.toReversed().find((m) => m.kind === "incoming")
                    ?.body ?? "你好",
                  false,
                  true,
                )
              }
            >
              <Sparkles size={14} />
              {ai.busy ? "AI 準備中…" : "生成 AI 回覆建議"}
            </button>
            <ol className="xp-stages">
              <li className="is-complete">
                <span>
                  <Check size={14} />
                </span>
                <div>
                  <h3>收到客戶查詢</h3>
                  <p>對話同客戶資料已經喺同一個工作台。</p>
                </div>
              </li>
              <li className={booking ? "is-complete" : ""}>
                <span>2</span>
                <div>
                  <h3>收集預約意向</h3>
                  {booking ? (
                    <p>
                      {booking.service}
                      <br />
                      {booking.date} {booking.time} · {booking.branch}
                    </p>
                  ) : (
                    <p>喺左邊填表，提交後建立待核實跟進卡。</p>
                  )}
                </div>
              </li>
              <li
                className={booking?.status === "confirmed" ? "is-complete" : ""}
              >
                <span>3</span>
                <div>
                  <h3>同事核實安排</h3>
                  {booking?.status === "confirmed" ? (
                    <p>已核實 · 費用安排 {booking.fee || "尚未填寫"}</p>
                  ) : booking ? (
                    <div className="xp-verify">
                      <label>
                        已核實費用安排
                        <input
                          aria-label="核實費用安排"
                          maxLength={100}
                          value={fee}
                          onChange={(e) => {
                            setFee(e.target.value);
                            setChecked(false);
                          }}
                        />
                      </label>
                      <label className="xp-checkbox">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => setChecked(e.target.checked)}
                        />
                        我已核實療程、名額、時間及費用安排（示範）
                      </label>
                      <button
                        className="bc-button"
                        disabled={!checked || !fee.trim()}
                        onClick={verify}
                      >
                        同事核實預約
                      </button>
                    </div>
                  ) : (
                    <p>客戶接受時間並不等於名額已確認。</p>
                  )}
                </div>
              </li>
              <li>
                <span>
                  <BellRing size={14} />
                </span>
                <div>
                  <h3>前一日提醒體驗</h3>
                  <p>
                    {booking
                      ? `${due} · 香港時間`
                      : "核實完成後，配對範本內嘅稱呼、療程、費用、日期、時間及分店。"}
                  </p>
                  <div className="xp-reminder-checks">
                    <label>
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                      />
                      假設通知同意有效
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={approved}
                        onChange={(e) => setApproved(e.target.checked)}
                      />
                      假設提醒範本可用
                    </label>
                  </div>
                  <button
                    className="bc-button"
                    disabled={booking?.status !== "confirmed"}
                    onClick={reminder}
                  >
                    模擬到提醒時間
                  </button>
                  <small>只在體驗對話加入訊息，不會建立真實背景排程。</small>
                </div>
              </li>
            </ol>
            {ai.error && (
              <div className="xp-feedback" role="alert">
                <p>{ai.error}</p>
                <button
                  onClick={() =>
                    void reply(
                      messages.toReversed().find((m) => m.kind === "incoming")
                        ?.body ?? "你好",
                      true,
                      true,
                    )
                  }
                >
                  改用示範引擎
                </button>
              </div>
            )}
            {notice && (
              <p className="xp-feedback" role="status">
                {notice}
              </p>
            )}
            {answer && (
              <AssistantResultCard
                result={answer}
                onInsert={(text) => {
                  d.dispatch({
                    type: "inbox",
                    action: {
                      type: "message",
                      conversationId: cv.id,
                      message: {
                        id: uid(),
                        conversationId: cv.id,
                        kind: "outgoing",
                        body: text,
                        author: "Mia · 示範",
                        at: actionTime(),
                        replyTo: null,
                      },
                    },
                  });
                  setAnswer(null);
                }}
              />
            )}
          </div>
        </div>
      </div>
      {form && (
        <Modal
          title="預約意向表單"
          subtitle="提交只代表心儀安排，需由同事核實。"
          onClose={() => setForm(false)}
        >
          <form
            className="xp-intake st-fields"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              const service = String(data.get("service")),
                branch = String(data.get("branch")),
                date = String(data.get("date")),
                time = String(data.get("time"));
              if (!flow) {
                setNotice("此品牌未有預約意向 Flow，請到畫布設定。");
                setForm(false);
                return;
              }
              const result = simulateFlow(flow, {
                ...DEFAULT_SIMULATION,
                intent: "booking",
                manualVerified: false,
                fields: {
                  name: person.name,
                  service,
                  branch,
                  date,
                  time,
                  fee: "待同事核實",
                },
              });
              if (result.issues.length || !result.followup) {
                setNotice(
                  result.issues[0] ?? "目前流程會轉真人，未有建立跟進卡節點。",
                );
                setForm(false);
                return;
              }
              d.dispatch({
                type: "intake",
                conversationId: cv.id,
                service,
                branch,
                date,
                time,
                id: uid(),
                at: actionTime(),
                recipientId: r?.id,
              });
              setForm(false);
              setChecked(false);
              setNotice("預約意向已建立，等待同事核實。");
            }}
          >
            <label>
              服務
              <select name="service">
                <option>
                  {cv.brandId === "nova-care" ? "肩頸舒緩" : "舒緩護理"}
                </option>
                <option>雙人同行護理</option>
              </select>
            </label>
            <label>
              分店
              <select name="branch">
                <option>中環示範店</option>
                <option>九龍示範店</option>
              </select>
            </label>
            <div className="bc-two">
              <label>
                心儀日期
                <input
                  aria-label="意向日期"
                  name="date"
                  type="date"
                  required
                  defaultValue={new Date(
                    actionTime() + 3 * 86400000 + 8 * 3600000,
                  )
                    .toISOString()
                    .slice(0, 10)}
                />
              </label>
              <label>
                心儀時間
                <input name="time" type="time" required defaultValue="15:00" />
              </label>
            </div>
            <button type="submit" className="bc-button bc-primary">
              提交預約意向
              <ArrowRight size={14} />
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
