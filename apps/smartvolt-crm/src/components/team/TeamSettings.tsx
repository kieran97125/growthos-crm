"use client";
import useSWR from "swr";
import { useEffect, useRef, useState } from "react";
import { MailPlus, ShieldCheck, Users, X, LoaderCircle } from "lucide-react";
import type { TeamAction, TeamPage, TeamMember } from "@/lib/team/model";
import "./team.css";
const roles = {
  owner: "公司擁有人",
  manager: "管理員",
  agent: "客服同事",
  viewer: "只供查看",
};
const statuses = {
  invited: "待接受",
  active: "使用中",
  suspended: "已停用",
  removed: "已移除",
};
const dates = (date: string) =>
  new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
export default function TeamSettings({ initial }: { initial: TeamPage }) {
  const { data = initial, mutate } = useSWR<TeamPage>(
    `/api/companies/${initial.companyId}/team`,
    async (url) => {
      const r = await fetch(url);
      const body = await r.json();
      if (!r.ok) throw Error(body.error ?? "未能讀取團隊資料。");
      return body;
    },
    { fallbackData: initial, refreshInterval: 60000, revalidateOnFocus: true },
  );
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<TeamMember | null>(null),
    [formKey, setFormKey] = useState(0),
    [isOpen, setIsOpen] = useState(false),
    [frozen, setFrozen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    pending = useRef<TeamAction | null>(null);
  useEffect(() => {
    if (isOpen && !dialog.current?.open) {
      dialog.current?.showModal();
      dialog.current
        ?.querySelector<HTMLInputElement>('input[name="name"]')
        ?.focus();
    }
  }, [isOpen, formKey]);
  function open(member: TeamMember | null) {
    setEditing(member);
    setFormKey((k) => k + 1);
    setError("");
    setNotice("");
    pending.current = null;
    setFrozen(false);
    setIsOpen(true);
  }
  async function send(command: TeamAction) {
    if (busy) return;
    pending.current = command;
    setFrozen(true);
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/companies/${data.companyId}/team`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(command),
        }),
        body = await r.json();
      if (!r.ok) throw Error(body.error ?? "未能儲存。");
      await mutate(body, { revalidate: false });
      pending.current = null;
      setFrozen(false);
      dialog.current?.close();
      setNotice(
        command.action === "invite"
          ? "邀請已儲存，郵件狀態見下方。"
          : "團隊權限已更新。",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "未能儲存，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending.current) {
      void send(pending.current);
      return;
    }
    const f = new FormData(e.currentTarget),
      brands =
        f.get("allBrands") === "on" ? null : f.getAll("brandIds").map(String),
      productIds = f.getAll("productIds") as ("crm" | "pos")[];
    if (!productIds.length || brands?.length === 0) {
      setError("請選擇至少一個品牌及產品。");
      return;
    }
    const fields = {
      commandId: crypto.randomUUID(),
      name: String(f.get("name") ?? ""),
      role: String(f.get("role")) as "manager" | "agent" | "viewer",
      brandIds: brands,
      productIds,
    };
    void send(
      editing
        ? {
            ...fields,
            action: "member",
            userId: editing.user_id,
            revision: editing.access_revision,
            status: String(f.get("status")) as
              "active" | "suspended" | "removed",
          }
        : { ...fields, action: "invite", email: String(f.get("email")) },
    );
  }
  const invitations = data.invitations.filter((i) => i.status === "invited"),
    active = data.members.filter((m) => m.status === "active").length;
  return (
    <div className="team-settings">
      <header className="team-heading">
        <div>
          <span className="sv-eyebrow">團隊與設定</span>
          <h1>同事與權限</h1>
          <p>邀請同事，分配佢哋需要嘅品牌及工作範圍。</p>
        </div>
        {data.canEdit && (
          <button
            className="sv-primary"
            onClick={() => open(null)}
            disabled={!data.mailReady}
          >
            <MailPlus size={18} />
            邀請同事
          </button>
        )}
      </header>
      <div className="team-summary">
        <span>
          <Users size={20} />
          <strong>{active}</strong> 位同事使用中
        </span>
        <span>
          {data.usedSeats} / {data.seatLimit} 席位已使用或預留
        </span>
        <span>
          <ShieldCheck size={18} />
          公司擁有人管理權限
        </span>
      </div>
      {!data.mailReady && data.canEdit && (
        <p role="status" className="team-note">
          邀請郵件尚未設定。現有成員權限仍可管理。
        </p>
      )}
      {notice && (
        <p role="status" className="team-note">
          {notice}
        </p>
      )}
      {error && !isOpen && (
        <p role="alert" className="team-error">
          {error}
        </p>
      )}
      <section aria-label="公司成員" className="team-members">
        {data.members.map((m) => (
          <article key={m.user_id} className="team-member">
            <span className="team-avatar" aria-hidden="true">
              {m.display_name.slice(0, 2)}
            </span>
            <div>
              <h2>{m.display_name}</h2>
              <p>
                {roles[m.role]} · {statuses[m.status]}
              </p>
              <span>
                {m.brand_ids
                  ? data.brands
                      .filter((b) => m.brand_ids?.includes(b.id))
                      .map((b) => b.name)
                      .join("、") || "指定品牌"
                  : "全部品牌"}{" "}
                ·{" "}
                {(m.product_ids ?? data.products)
                  .map((p) => p.toUpperCase())
                  .join(" / ")}
              </span>
            </div>
            {data.canEdit && m.role !== "owner" && (
              <button className="sv-secondary" onClick={() => open(m)}>
                管理權限
              </button>
            )}
          </article>
        ))}
      </section>
      <section className="team-invitations">
        <h2>
          待接受邀請{" "}
          {invitations.length > 0 && <span>{invitations.length}</span>}
        </h2>
        {!invitations.length ? (
          <p>暫時冇待接受嘅邀請。</p>
        ) : (
          invitations.map((i) => (
            <article key={i.id}>
              <div>
                <strong>{i.display_name}</strong>
                <p>{i.email}</p>
                <span>
                  {Date.parse(i.expires_at) <= Date.parse(data.checkedAt)
                    ? "邀請已到期"
                    : i.mail_state === "submitted"
                      ? "郵件已提交 · 等待對方接受"
                      : i.mail_state === "failed"
                        ? "郵件提交失敗 · 請重新邀請"
                        : i.mail_state === "submitting"
                          ? "郵件提交結果待核對 · 不會自動重發"
                          : "郵件未提交"}{" "}
                  · {dates(i.created_at)}
                </span>
              </div>
              {data.canEdit && (
                <button
                  className="sv-secondary"
                  disabled={busy}
                  onClick={() =>
                    void send({
                      action: "revoke",
                      commandId: crypto.randomUUID(),
                      id: i.id,
                    })
                  }
                >
                  取消邀請
                </button>
              )}
            </article>
          ))
        )}
      </section>
      <details className="team-history">
        <summary>查看最近權限紀錄</summary>
        <ol>
          {data.audit.map((a) => (
            <li key={a.id}>
              <span>{dates(a.created_at)}</span>　
              {(
                {
                  invite: "發出邀請",
                  member: "修改成員權限",
                  revoke: "取消邀請",
                  accepted: "接受邀請",
                } as Record<string, string>
              )[a.kind] ?? a.kind}
            </li>
          ))}
        </ol>
      </details>
      <dialog
        ref={dialog}
        onClose={() => setIsOpen(false)}
        aria-labelledby="team-dialog-title"
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <form key={formKey} onSubmit={submit}>
          <header>
            <h2 id="team-dialog-title">
              {editing ? `管理 ${editing.display_name}` : "邀請新同事"}
            </h2>
            <button
              type="button"
              className="team-close"
              aria-label="關閉"
              disabled={busy}
              onClick={() => dialog.current?.close()}
            >
              <X size={20} />
            </button>
          </header>
          <fieldset disabled={busy || frozen}>
            <label>
              同事名稱
              <input
                name="name"
                required
                maxLength={80}
                defaultValue={editing?.display_name}
              />
            </label>
            {!editing && (
              <label>
                工作電郵
                <input
                  name="email"
                  type="email"
                  required
                  maxLength={160}
                  autoComplete="email"
                />
              </label>
            )}
            <label>
              角色
              <select name="role" defaultValue={editing?.role ?? "agent"}>
                <option value="agent">客服同事 — 跟進及回覆客戶</option>
                <option value="manager">管理員 — 管理流程及查看成效</option>
                <option value="viewer">只供查看 — 不可修改或發送</option>
              </select>
            </label>
            {editing && (
              <label>
                使用狀態
                <select
                  name="status"
                  defaultValue={
                    editing.status === "invited" ? "suspended" : editing.status
                  }
                >
                  <option value="active">使用中</option>
                  <option value="suspended">停用</option>
                  <option value="removed">移除權限</option>
                </select>
              </label>
            )}
            <div className="team-product">
              <span>可使用產品</span>
              {data.products.map((p) => (
                <label key={p}>
                  <input
                    type="checkbox"
                    name="productIds"
                    value={p}
                    defaultChecked={
                      editing?.product_ids
                        ? editing.product_ids.includes(p)
                        : true
                    }
                  />
                  {p.toUpperCase()}
                </label>
              ))}
            </div>
            <BrandFields
              key={formKey}
              brands={data.brands}
              selected={editing?.brand_ids ?? null}
            />
          </fieldset>
          {error && (
            <p role="alert" className="team-error">
              {error}
            </p>
          )}
          <p className="team-hint">
            {editing
              ? "儲存後，下次操作即按新權限核對。公司擁有人權限會保留。"
              : "對方收到郵件並接受後，先會成為可用成員。邀請有效期為七日。"}
          </p>
          <footer>
            <button
              className="sv-secondary"
              type="button"
              disabled={busy}
              onClick={() => dialog.current?.close()}
            >
              返回
            </button>
            <button
              className="sv-primary"
              disabled={busy || (!editing && !data.mailReady)}
            >
              {busy ? (
                <>
                  <LoaderCircle size={16} className="team-spin" />
                  正在儲存…
                </>
              ) : frozen ? (
                "重試同一操作"
              ) : editing ? (
                "儲存權限"
              ) : (
                "寄出邀請"
              )}
            </button>
          </footer>
        </form>
      </dialog>
    </div>
  );
}
function BrandFields({
  brands,
  selected,
}: {
  brands: TeamPage["brands"];
  selected: string[] | null;
}) {
  const [all, setAll] = useState(selected === null);
  return (
    <details className="team-brand-options" open={selected !== null}>
      <summary>品牌範圍 · {all ? "全部品牌" : "指定品牌"}</summary>
      <label>
        <input
          type="checkbox"
          name="allBrands"
          checked={all}
          onChange={(e) => setAll(e.target.checked)}
        />
        全部品牌（包括日後新增）
      </label>
      {!all &&
        brands.map((b) => (
          <label key={b.id}>
            <input
              type="checkbox"
              name="brandIds"
              value={b.id}
              defaultChecked={selected?.includes(b.id) ?? false}
            />
            {b.name}
          </label>
        ))}
    </details>
  );
}
