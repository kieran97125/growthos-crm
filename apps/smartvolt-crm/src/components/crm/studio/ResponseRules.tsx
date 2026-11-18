"use client";
import { Hand, LockKeyhole, MessageSquare, ShieldCheck } from "lucide-react";
import type { BotProfile } from "./model";
import { replyScenarios } from "@/lib/ai/scenarios";

const topics = [
  {
    key: "allowService",
    title: "服務介紹及已核實收費",
    detail: "介紹服務、適合對象及知識庫內有效收費。",
  },
  {
    key: "allowLocation",
    title: "分店及到店指引",
    detail: "回答地址、交通及已確認嘅到店資料。",
  },
  {
    key: "allowHours",
    title: "營業及接待時間",
    detail: "只按品牌資料回答營業時間。",
  },
] as const;
const handoffs = [
  {
    title: "客人要求真人",
    detail: "尊重客人想同同事傾嘅要求。",
    scenario: "human",
  },
  {
    title: "投訴、退款或專業判斷",
    detail: "涉及個案決定，交同事核實處理。",
    scenario: "complaint",
  },
  {
    title: "資料不足或無法核對來源",
    detail: "資料過期、未核准或答案缺少依據，先交同事。",
    scenario: "unknown",
  },
  {
    title: "正式預約及即時名額",
    detail: "可以收集意向；未有核實紀錄唔會確認預約。",
    scenario: "booking",
  },
] as const;

export default function ResponseRules({
  profile,
  disabled,
  patch,
  onTry,
}: {
  profile: BotProfile;
  disabled: boolean;
  patch: (changes: Partial<BotProfile>) => void;
  onTry: (question: string) => void;
}) {
  return (
    <div className="st-response-rules">
      <section
        className="st-editor-section"
        aria-labelledby="reply-tone-heading"
      >
        <div className="st-editor-section-title">
          <span>01</span>
          <div>
            <h2 id="reply-tone-heading">語氣與品牌形象</h2>
            <p>先揀品牌嘅說話方式，再設定助手名稱同開場白。</p>
          </div>
        </div>
        <fieldset className="st-tone-options" disabled={disabled}>
          <legend>回覆語氣</legend>
          {(
            [
              [
                "friendly",
                "自然親切・廣東話",
                "你好 😊 可以話我知你想了解邊方面？",
              ],
              [
                "professional",
                "簡潔專業・繁體中文",
                "你好。請問你希望了解哪方面的資料？",
              ],
            ] as const
          ).map(([value, title, sample]) => (
            <label key={value}>
              <input
                type="radio"
                name={`tone-${profile.brandId}`}
                value={value}
                checked={profile.tone === value}
                onChange={() => patch({ tone: value })}
              />
              <span>
                <b>{title}</b>
                <small>{sample}</small>
              </span>
            </label>
          ))}
          <small>以上係語氣示例，實際答案會根據品牌知識生成。</small>
        </fieldset>
        <div className="st-fields st-rule-identity">
          <label>
            助手名稱
            <input
              aria-label="助手名稱"
              maxLength={60}
              disabled={disabled}
              value={profile.name}
              onChange={(e) => {
                if (e.target.value.trim()) patch({ name: e.target.value });
              }}
            />
          </label>
          <label>
            開場白
            <textarea
              aria-label="BOT 開場白"
              rows={3}
              maxLength={1000}
              disabled={disabled}
              value={profile.greeting}
              onChange={(e) => patch({ greeting: e.target.value })}
            />
          </label>
        </div>
      </section>
      <section
        className="st-editor-section"
        aria-labelledby="reply-scope-heading"
      >
        <div className="st-editor-section-title">
          <span>02</span>
          <div>
            <h2 id="reply-scope-heading">可回答範圍</h2>
            <p>開啟嘅範圍仍須有有效品牌知識；關閉嘅問題交同事核實。</p>
          </div>
        </div>
        <fieldset className="st-rule-topics" disabled={disabled}>
          <legend>允許 AI 處理嘅問題</legend>
          {topics.map((item) => (
            <label key={item.key}>
              <input
                type="checkbox"
                checked={profile[item.key]}
                onChange={(e) => patch({ [item.key]: e.target.checked })}
              />
              <span>
                <b>{item.title}</b>
                <small>{item.detail}</small>
              </span>
              <span className="st-topic-state">
                {profile[item.key] ? "允許回答" : "交同事"}
              </span>
            </label>
          ))}
        </fieldset>
        <p className="st-rule-hint">
          <ShieldCheck size={14} aria-hidden="true" />
          價錢、優惠及連結都要有資料依據；設定語氣唔會改變事實。
        </p>
      </section>
      <section
        className="st-editor-section"
        aria-labelledby="reply-handoff-heading"
      >
        <div className="st-editor-section-title">
          <span>03</span>
          <div>
            <h2 id="reply-handoff-heading">交接條件</h2>
            <p>以下處理邊界持續生效。可以逐個試答，檢查交接原因。</p>
          </div>
        </div>
        <div className="st-rule-handoffs">
          {handoffs.map((item) => (
            <article key={item.scenario}>
              <Hand size={16} aria-hidden="true" />
              <div>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    onTry(
                      replyScenarios.find((s) => s.id === item.scenario)!
                        .question,
                    )
                  }
                >
                  <MessageSquare size={12} aria-hidden="true" />
                  試答：
                  {replyScenarios.find((s) => s.id === item.scenario)!.label}
                </button>
              </div>
              <span>
                <LockKeyhole size={11} aria-hidden="true" />
                持續生效
              </span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
