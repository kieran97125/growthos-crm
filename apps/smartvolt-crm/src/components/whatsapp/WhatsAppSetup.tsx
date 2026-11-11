"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  Copy,
  KeyRound,
  LockKeyhole,
  MessageCircle,
  Radio,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import type {
  WaConnectionSummary,
  WaConnectionsResponse,
} from "@/lib/whatsapp/responses";
import {
  isForeground,
  whatsappRequest,
  whatsappTime,
  verifiedConnections,
  verifiedConnectionSave,
} from "./transport";

type Form = {
  id?: string;
  brandId: string;
  appId: string;
  accountId: string;
  messagingAccountId: string;
  phoneNumberId: string;
  appSecret: string;
  accessToken: string;
};
const emptyForm: Form = {
  brandId: "",
  appId: "",
  accountId: "",
  messagingAccountId: "",
  phoneNumberId: "",
  appSecret: "",
  accessToken: "",
};
const message = (e: unknown) =>
  e instanceof Error ? e.message : "暫時未能完成連接。";

export default function WhatsAppSetup({
  companyId,
  companyName,
  owner,
}: {
  companyId: string;
  companyName: string;
  owner: boolean;
}) {
  const base = `/api/companies/${encodeURIComponent(companyId)}/whatsapp`;
  const [data, setData] = useState<WaConnectionsResponse | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [oneTime, setOneTime] = useState<{
    connectionId: string;
    webhookUrl: string;
    verifyToken: string;
  } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const response = verifiedConnections(
        await whatsappRequest<WaConnectionsResponse>(`${base}/connections`),
      );
      setData(response);
      setForm((old) =>
        old.brandId ? old : { ...old, brandId: response.brands[0]?.id || "" },
      );
      setError(null);
    } catch (e) {
      setError(message(e));
    }
  }, [base]);
  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    const refresh = () => {
      if (isForeground()) void load();
    };
    const timer = setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);
  const canManage = owner && data?.canManage;
  const update = (field: keyof Form, value: string) =>
    setForm((old) => ({ ...old, [field]: value }));
  const choose = (id: string) => {
    const c = data?.connections.find((item) => item.id === id);
    setForm(
      c
        ? {
            id: c.id,
            brandId: c.brandId,
            appId: c.appId,
            accountId: c.accountId,
            messagingAccountId: c.messagingAccountId || "",
            phoneNumberId: c.phoneNumberId,
            appSecret: "",
            accessToken: "",
          }
        : { ...emptyForm, brandId: data?.brands[0]?.id || "" },
    );
    setOneTime(null);
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage || saving || !data?.encryptionReady) return;
    setSaving(true);
    setError(null);
    setOneTime(null);
    try {
      const result = verifiedConnectionSave(
        await whatsappRequest<{
          connection: WaConnectionSummary;
          webhookUrl: string;
          verifyToken: string;
        }>(`${base}/connections`, {
          method: "POST",
          body: JSON.stringify({
            ...form,
            messagingAccountId: form.messagingAccountId || undefined,
          }),
        }),
      );
      setOneTime({
        connectionId: result.connection.id,
        webhookUrl: result.webhookUrl,
        verifyToken: result.verifyToken,
      });
      setForm((old) => ({
        ...old,
        id: result.connection.id,
        appSecret: "",
        accessToken: "",
      }));
      setData((old) =>
        old
          ? {
              ...old,
              connections: [
                ...old.connections.filter((c) => c.id !== result.connection.id),
                result.connection,
              ],
            }
          : old,
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setSaving(false);
    }
  };
  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setError("未能複製。請喺欄位選取內容後複製。");
    }
  };
  const selected =
    data?.connections.find(
      (c) => c.id === (oneTime?.connectionId || form.id),
    ) || data?.connections[0];
  return (
    <main className="wa-setup">
      <header className="wa-setup-nav">
        <a href={`/company/${companyId}/settings`}>
          <ArrowLeft size={16} aria-hidden="true" />
          公司設定
        </a>
        <a href={`/company/${companyId}/crm/whatsapp`}>
          前往收件箱
          <ArrowRight size={16} aria-hidden="true" />
        </a>
      </header>
      <div className="wa-setup-heading">
        <span className="wa-eyebrow">WHATSAPP · COMPANY CONNECTION</span>
        <h1>接通客戶，保留每個機會。</h1>
        <p>
          為 {companyName} 連接專屬 WhatsApp Business
          號碼，接收真實查詢及由團隊人工回覆。
        </p>
      </div>
      <div className="wa-setup-layout">
        <aside className="wa-setup-guide">
          <div className="wa-setup-symbol">
            <MessageCircle size={28} aria-hidden="true" />
          </div>
          <h2>一個公司，一條清晰連接。</h2>
          <p>
            先核實 Meta 資產，再驗證 webhook，最後用另一個 WhatsApp
            帳戶傳入訊息完成實測。
          </p>
          <ol className="wa-steps">
            <li className="is-current">
              <span>01</span>
              <div>
                <strong>公司及號碼</strong>
                <p>選擇品牌，連接正確 Meta 資產。</p>
              </div>
            </li>
            <li className={selected ? "is-current" : ""}>
              <span>02</span>
              <div>
                <strong>Webhook 驗證</strong>
                <p>喺 Meta 貼上回呼網址及一次性驗證碼。</p>
              </div>
            </li>
            <li className={selected?.lastInboundAt ? "is-current" : ""}>
              <span>03</span>
              <div>
                <strong>接收第一個真實查詢</strong>
                <p>確認入站後，前往收件箱回覆。</p>
              </div>
            </li>
          </ol>
          <div className="wa-security-note">
            <LockKeyhole size={17} aria-hidden="true" />
            <p>
              密鑰只交由伺服器加密保存。已儲存嘅 App Secret 同 Access Token
              唔會再次顯示。
            </p>
          </div>
        </aside>
        <div className="wa-setup-content">
          {error && (
            <div className="wa-alert" role="alert">
              <CircleAlert size={17} aria-hidden="true" />
              <span>{error}</span>
              <button onClick={() => void load()}>重新核對</button>
            </div>
          )}
          {!data && (
            <div className="wa-setup-card" role="status">
              <RefreshCw size={20} className="wa-spin" aria-hidden="true" />
              <p>{error ? "連接資料未能讀取。" : "核實公司連接狀態中…"}</p>
            </div>
          )}
          {data && (
            <>
              <section className="wa-setup-card">
                <div className="wa-section-heading">
                  <span className="wa-section-icon">
                    <Radio size={18} aria-hidden="true" />
                  </span>
                  <div>
                    <h2>連接狀態</h2>
                    <p>每個階段獨立核實，儲存設定唔等於已收到訊息。</p>
                  </div>
                </div>
                {data.connections.length === 0 ? (
                  <p className="wa-setup-muted">未有已儲存嘅 WhatsApp 連接。</p>
                ) : (
                  data.connections.map((connection) => (
                    <div className="wa-connection-status" key={connection.id}>
                      <div>
                        <strong>
                          {data.brands.find((b) => b.id === connection.brandId)
                            ?.name || "公司品牌"}
                        </strong>
                        <span>
                          {connection.displayPhone || "Meta 公司號碼"}
                          {connection.state === "disabled" ? " · 已停用" : ""}
                        </span>
                      </div>
                      <ul>
                        <li className="is-done">
                          <CheckCircle2 size={15} aria-hidden="true" />
                          設定已儲存
                        </li>
                        <li
                          className={
                            connection.webhookVerifiedAt ? "is-done" : ""
                          }
                        >
                          {connection.webhookVerifiedAt ? (
                            <CheckCircle2 size={15} aria-hidden="true" />
                          ) : (
                            <ClockMark />
                          )}
                          Webhook{" "}
                          {connection.webhookVerifiedAt ? "已驗證" : "等候驗證"}
                        </li>
                        <li
                          className={connection.lastInboundAt ? "is-done" : ""}
                        >
                          {connection.lastInboundAt ? (
                            <CheckCircle2 size={15} aria-hidden="true" />
                          ) : (
                            <ClockMark />
                          )}
                          {connection.lastInboundAt
                            ? `收到訊息 · ${whatsappTime(connection.lastInboundAt, true)}`
                            : "等候首個入站訊息"}
                        </li>
                      </ul>
                    </div>
                  ))
                )}
              </section>
              {!canManage && (
                <section className="wa-setup-card">
                  <ShieldCheck size={23} aria-hidden="true" />
                  <h2>由公司 Owner 管理連接</h2>
                  <p>
                    你可以查看連接狀態。設定 Meta 資產或更新密鑰，需要公司 Owner
                    戶口。
                  </p>
                  <a
                    className="wa-secondary"
                    href={`/company/${companyId}/crm/whatsapp`}
                  >
                    返回收件箱
                    <ArrowRight size={15} aria-hidden="true" />
                  </a>
                </section>
              )}
              {canManage && (
                <section className="wa-setup-card">
                  <div className="wa-section-heading">
                    <span className="wa-section-icon">
                      <KeyRound size={18} aria-hidden="true" />
                    </span>
                    <div>
                      <h2>Meta 連接資料</h2>
                      <p>
                        請使用屬於此公司嘅 Meta Business 資產及系統使用者
                        Token。每個 Meta App 目前只接一個 WhatsApp 電話。
                      </p>
                    </div>
                  </div>
                  {!data.encryptionReady && (
                    <div className="wa-alert" role="status">
                      <CircleAlert size={17} aria-hidden="true" />
                      <span>
                        伺服器嘅 WhatsApp
                        加密設定尚未就緒，暫時未能儲存密鑰。請先由系統管理員完成設定。
                      </span>
                    </div>
                  )}
                  <form
                    onSubmit={save}
                    className="wa-setup-form"
                    autoComplete="off"
                  >
                    {data.connections.length > 0 && (
                      <label>
                        連接
                        <select
                          value={form.id || ""}
                          onChange={(e) => choose(e.target.value)}
                          disabled={saving}
                        >
                          <option value="">新增公司號碼</option>
                          {data.connections.map((c) => (
                            <option value={c.id} key={c.id}>
                              {c.displayPhone || c.phoneNumberId} ·{" "}
                              {
                                data.brands.find((b) => b.id === c.brandId)
                                  ?.name
                              }
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label>
                      所屬品牌
                      <select
                        required
                        value={form.brandId}
                        onChange={(e) => update("brandId", e.target.value)}
                        disabled={saving}
                      >
                        <option value="" disabled>
                          選擇品牌
                        </option>
                        {data.brands.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="wa-field-grid">
                      <label>
                        Meta App ID
                        <input
                          value={form.appId}
                          onChange={(e) => update("appId", e.target.value)}
                          required
                          inputMode="numeric"
                          pattern="[0-9]+"
                          disabled={saving}
                        />
                      </label>
                      <label>
                        Phone Number ID
                        <input
                          value={form.phoneNumberId}
                          onChange={(e) =>
                            update("phoneNumberId", e.target.value)
                          }
                          required
                          inputMode="numeric"
                          pattern="[0-9]+"
                          disabled={saving}
                        />
                      </label>
                    </div>
                    <label>
                      WhatsApp Account / WABA ID
                      <input
                        value={form.accountId}
                        onChange={(e) => update("accountId", e.target.value)}
                        required
                        inputMode="numeric"
                        pattern="[0-9]+"
                        disabled={saving}
                      />
                      <small>用作 webhook 訂閱嘅 WhatsApp 帳戶識別碼。</small>
                    </label>
                    <label>
                      Messaging Account ID{" "}
                      <span className="wa-optional">選填</span>
                      <input
                        value={form.messagingAccountId}
                        onChange={(e) =>
                          update("messagingAccountId", e.target.value)
                        }
                        inputMode="numeric"
                        pattern="[0-9]*"
                        disabled={saving}
                      />
                      <small>
                        如 Meta 資產設定要求指定訊息帳戶，請一併填寫。
                      </small>
                    </label>
                    <label>
                      App Secret
                      <input
                        value={form.appSecret}
                        onChange={(e) => update("appSecret", e.target.value)}
                        type="password"
                        required
                        autoComplete="new-password"
                        minLength={16}
                        maxLength={256}
                        spellCheck={false}
                        disabled={saving}
                        placeholder={
                          form.id
                            ? "重新輸入以更新連接"
                            : "輸入 Meta App Secret"
                        }
                      />
                    </label>
                    <label>
                      系統使用者 Access Token
                      <input
                        value={form.accessToken}
                        onChange={(e) => update("accessToken", e.target.value)}
                        type="password"
                        required
                        autoComplete="new-password"
                        minLength={16}
                        maxLength={8192}
                        spellCheck={false}
                        disabled={saving}
                        placeholder="輸入此公司嘅 WhatsApp Token"
                      />
                      <small>
                        需要對應 WhatsApp
                        資產嘅管理及訊息權限。唔好用個人或其他公司嘅 Token。
                      </small>
                    </label>
                    {form.id && (
                      <p className="wa-composer-notice">
                        重新儲存會更新連接資料並產生新 webhook
                        驗證碼；請同步更新 Meta 設定。
                      </p>
                    )}
                    <button
                      className="wa-primary"
                      type="submit"
                      disabled={
                        saving || !data.encryptionReady || !form.brandId
                      }
                    >
                      {saving ? (
                        <RefreshCw
                          className="wa-spin"
                          size={16}
                          aria-hidden="true"
                        />
                      ) : (
                        <LockKeyhole size={16} aria-hidden="true" />
                      )}
                      {saving ? "核實 Meta 資料中…" : "核實並加密儲存"}
                    </button>
                  </form>
                </section>
              )}
              {oneTime && (
                <section className="wa-setup-card wa-callback-card">
                  <div className="wa-section-heading">
                    <span className="wa-section-icon">
                      <Check size={18} aria-hidden="true" />
                    </span>
                    <div>
                      <h2>已儲存，下一步驗證 webhook</h2>
                      <p>
                        將以下資料填入同一個 Meta App 嘅 WhatsApp Webhook
                        設定，訂閱 messages 欄位，再將此 WhatsApp 帳戶訂閱到此
                        App。帳戶訂閱需要透過 Meta 完成，本系統唔會自動代辦。
                      </p>
                    </div>
                  </div>
                  <p className="wa-setup-muted">
                    如需要用 Graph API 完成帳戶訂閱：用同一公司嘅系統使用者
                    Token，對 <code>/{form.accountId}/subscribed_apps</code>{" "}
                    提交 POST。之後仍需實際傳入訊息核實接收。
                  </p>
                  <label className="wa-copy-field">
                    Callback URL
                    <div>
                      <input
                        readOnly
                        value={oneTime.webhookUrl}
                        aria-label="Callback URL"
                      />
                      <button
                        className="wa-icon-button"
                        onClick={() => void copy(oneTime.webhookUrl, "url")}
                        aria-label="複製 Callback URL"
                      >
                        {copied === "url" ? (
                          <Check size={17} />
                        ) : (
                          <Copy size={17} />
                        )}
                      </button>
                    </div>
                  </label>
                  <label className="wa-copy-field">
                    Verify Token · 只顯示今次
                    <div>
                      <input
                        readOnly
                        value={oneTime.verifyToken}
                        type="password"
                        aria-label="一次性 Verify Token"
                        autoComplete="off"
                      />
                      <button
                        className="wa-icon-button"
                        onClick={() => void copy(oneTime.verifyToken, "token")}
                        aria-label="複製一次性 Verify Token"
                      >
                        {copied === "token" ? (
                          <Check size={17} />
                        ) : (
                          <Copy size={17} />
                        )}
                      </button>
                    </div>
                  </label>
                  <p className="wa-setup-muted" role="status">
                    {copied
                      ? "已複製。"
                      : "重新整理或離開此頁後，驗證碼唔會再次顯示。"}
                  </p>
                </section>
              )}
              {selected?.webhookVerifiedAt && (
                <section className="wa-setup-card">
                  <div className="wa-section-heading">
                    <span className="wa-section-icon">
                      <MessageCircle size={18} aria-hidden="true" />
                    </span>
                    <div>
                      <h2>
                        {selected.lastInboundAt
                          ? "已收到真實訊息"
                          : "等候第一個真實訊息"}
                      </h2>
                      <p>
                        {selected.lastInboundAt
                          ? "前往收件箱，選擇客戶後人工回覆。"
                          : "由另一個 WhatsApp 帳戶向公司號碼發訊息；本頁會自動更新入站狀態。"}
                      </p>
                    </div>
                  </div>
                  <a
                    className="wa-primary"
                    href={`/company/${companyId}/crm/whatsapp`}
                  >
                    前往收件箱
                    <ArrowRight size={15} aria-hidden="true" />
                  </a>
                </section>
              )}
              <p className="wa-setup-footnote">
                現有 WhatsApp Business App 號碼能否同時使用，需要符合 Meta
                及接駁方案資格。完成核實前，請保留現有號碼設定。
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
function ClockMark() {
  return <span className="wa-pending-dot" aria-hidden="true" />;
}
