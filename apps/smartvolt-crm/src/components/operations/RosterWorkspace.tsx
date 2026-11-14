"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Plus, Trash2 } from "lucide-react";
import {
  rosterProfile,
  type RosterPage,
  type RosterProfile,
} from "@/lib/operations/roster";
import { engagementFetcher } from "@/components/engagement/fetcher";
import { useRecordedCommand } from "@/components/engagement/useRecordedCommand";
import "../engagement/engagement.css";
const time = (n: number) =>
    String(Math.floor(n / 60)).padStart(2, "0") +
    ":" +
    String(n % 60).padStart(2, "0"),
  mins = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
export default function RosterWorkspace({
  companyId,
  initial,
}: {
  companyId: string;
  initial: RosterPage;
}) {
  const endpoint = `/api/companies/${companyId}/roster`,
    { data = initial, mutate } = useSWR<RosterPage>(
      endpoint,
      engagementFetcher,
      { fallbackData: initial },
    ),
    command = useRecordedCommand(endpoint, () => mutate()),
    [member, setMember] = useState<string | null>(null),
    [localError, setLocalError] = useState("");
  const selected = data.members.find((m) => m.id === member);
  return (
    <main className="eng-work">
      <header className="eng-header">
        <div>
          <span className="eng-eyebrow">TEAM ROUTING</span>
          <h1>啱嘅客，交畀啱嘅同事</h1>
          <p>分店、專長、值班同休假，會同在線狀態及接客上限一齊核對。</p>
        </div>
        <Link href={`/company/${companyId}/crm/operations`}>
          返回跟進工作台
        </Link>
      </header>
      {(command.error || localError || command.notice) && (
        <p
          role={command.error || localError ? "alert" : "status"}
          className="eng-alert"
        >
          {command.error || localError || command.notice}
        </p>
      )}
      {command.frozen && (
        <button disabled={command.busy} onClick={() => void command.retry()}>
          核對同一請求
        </button>
      )}
      <section className="eng-campaigns">
        {data.members.map((m) => (
          <article className="eng-campaign" key={m.id}>
            <div className="eng-campaign-main">
              <h2>{m.name}</h2>
              <p>
                {m.profile.branchIds
                  .map((id) => data.branches.find((b) => b.id === id)?.name)
                  .filter(Boolean)
                  .join("、") || "未指定分店"}{" "}
                · {m.profile.skills.join("、") || "未設定專長"}
              </p>
              <span>
                {m.profile.rosterEnabled
                  ? "按值班時間派客"
                  : "沿用在線及容量規則"}{" "}
                · {m.profile.leavePeriods.length} 段休假
              </span>
            </div>
            <button
              disabled={command.busy || command.frozen}
              onClick={() => {
                setMember(m.id);
                setLocalError("");
              }}
            >
              設定
            </button>
          </article>
        ))}
      </section>
      {selected && (
        <RosterForm
          key={selected.id + ":" + selected.profile.revision}
          profile={selected.profile}
          branches={data.branches}
          disabled={command.busy || command.frozen}
          name={selected.name}
          onClose={() => setMember(null)}
          onSave={async (p) => {
            const parsed = rosterProfile.safeParse(p);
            if (!parsed.success) {
              setLocalError(parsed.error.issues[0].message);
              return;
            }
            if (
              await command.send({
                action: "member",
                commandId: crypto.randomUUID(),
                userId: selected.id,
                ...parsed.data,
              })
            )
              setMember(null);
          }}
        />
      )}
      <details className="eng-details">
        <summary>
          分店管理<span>以固定分店識別派客</span>
        </summary>
        <div className="eng-form-fields">
          {data.branches.map((b) => (
            <form
              className="eng-two"
              key={b.id + ":" + b.revision}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void command.send({
                  action: "branch",
                  commandId: crypto.randomUUID(),
                  id: b.id,
                  revision: b.revision,
                  name: String(f.get("name")),
                  active: f.has("active"),
                });
              }}
            >
              <label>
                分店名稱
                <input
                  name="name"
                  defaultValue={b.name}
                  maxLength={80}
                  required
                  disabled={command.frozen}
                />
              </label>
              <label className="eng-check">
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={b.active}
                  disabled={command.frozen}
                />
                接收派客
              </label>
              <button disabled={command.busy || command.frozen}>
                儲存分店
              </button>
            </form>
          ))}
          <form
            className="eng-two"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void command.send({
                action: "branch",
                commandId: crypto.randomUUID(),
                id: crypto.randomUUID(),
                revision: 0,
                name: String(f.get("name")),
                active: true,
              });
            }}
          >
            <label>
              新增分店
              <input
                name="name"
                required
                maxLength={80}
                disabled={command.frozen}
              />
            </label>
            <button disabled={command.busy || command.frozen}>
              <Plus size={15} />
              新增
            </button>
          </form>
        </div>
      </details>
      <p className="eng-hint">
        更表及休假只影響新嘅自動派客；現有負責同事會保留。未有符合條件嘅人手，查詢會留喺待派佇列。
      </p>
    </main>
  );
}
function RosterForm({
  profile,
  branches,
  disabled,
  name,
  onSave,
  onClose,
}: {
  profile: RosterProfile;
  branches: RosterPage["branches"];
  disabled: boolean;
  name: string;
  onSave: (p: RosterProfile) => Promise<void>;
  onClose: () => void;
}) {
  const [p, setP] = useState(profile),
    [leaveFrom, setLeaveFrom] = useState(""),
    [leaveTo, setLeaveTo] = useState("");
  return (
    <section className="eng-details" aria-label={name + "派客設定"}>
      <h2>{name} · 派客設定</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSave(p);
        }}
      >
        <fieldset disabled={disabled} className="eng-form-fields">
          <div className="eng-tags">
            {branches.map((b) => (
              <label key={b.id} className="eng-check">
                <input
                  type="checkbox"
                  checked={p.branchIds.includes(b.id)}
                  onChange={(e) =>
                    setP({
                      ...p,
                      branchIds: e.target.checked
                        ? [...p.branchIds, b.id]
                        : p.branchIds.filter((x) => x !== b.id),
                    })
                  }
                />
                {b.name}
                {!b.active && "（已停用）"}
              </label>
            ))}
          </div>
          <label>
            專長（以逗號分開）
            <input
              value={p.skills.join(",")}
              onChange={(e) =>
                setP({
                  ...p,
                  skills: e.target.value.split(/[,，]/).map((x) => x.trim()),
                })
              }
              onBlur={() => setP({ ...p, skills: p.skills.filter(Boolean) })}
            />
          </label>
          <label className="eng-check">
            <input
              type="checkbox"
              checked={p.rosterEnabled}
              onChange={(e) => setP({ ...p, rosterEnabled: e.target.checked })}
            />
            只在值班時段自動接客
          </label>
          <label>
            值班時區
            <input
              required
              value={p.timeZone}
              onChange={(e) => setP({ ...p, timeZone: e.target.value })}
            />
          </label>
          {p.weekly.map((s, i) => (
            <div className="eng-two" key={i}>
              <label>
                星期
                <select
                  value={s.day}
                  onChange={(e) =>
                    setP({
                      ...p,
                      weekly: p.weekly.map((x, j) =>
                        j === i ? { ...x, day: Number(e.target.value) } : x,
                      ),
                    })
                  }
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <option key={d} value={d}>
                      {["一", "二", "三", "四", "五", "六", "日"][d - 1]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                開始
                <input
                  type="time"
                  value={time(s.start)}
                  onChange={(e) =>
                    setP({
                      ...p,
                      weekly: p.weekly.map((x, j) =>
                        j === i ? { ...x, start: mins(e.target.value) } : x,
                      ),
                    })
                  }
                />
              </label>
              <label>
                結束
                <input
                  type="time"
                  value={s.end === 1440 ? "00:00" : time(s.end)}
                  onChange={(e) =>
                    setP({
                      ...p,
                      weekly: p.weekly.map((x, j) =>
                        j === i
                          ? { ...x, end: mins(e.target.value) || 1440 }
                          : x,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                aria-label={`刪除值班時段 ${i + 1}`}
                onClick={() =>
                  setP({ ...p, weekly: p.weekly.filter((_, j) => j !== i) })
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setP({
                ...p,
                weekly: [...p.weekly, { day: 1, start: 540, end: 1080 }],
              })
            }
          >
            加入值班時段
          </button>
          <h3>休假</h3>
          {p.leavePeriods.map((l, i) => (
            <div className="eng-two" key={i}>
              <span>
                {new Date(l.from).toLocaleString("zh-HK", {
                  timeZone: "Asia/Hong_Kong",
                })}{" "}
                至{" "}
                {new Date(l.to).toLocaleString("zh-HK", {
                  timeZone: "Asia/Hong_Kong",
                })}
              </span>
              <button
                type="button"
                aria-label={`刪除休假 ${i + 1}`}
                onClick={() =>
                  setP({
                    ...p,
                    leavePeriods: p.leavePeriods.filter((_, j) => j !== i),
                  })
                }
              >
                移除
              </button>
            </div>
          ))}
          <div className="eng-two">
            <label>
              休假開始（香港）
              <input
                type="datetime-local"
                value={leaveFrom}
                onChange={(e) => setLeaveFrom(e.target.value)}
              />
            </label>
            <label>
              休假結束（香港）
              <input
                type="datetime-local"
                value={leaveTo}
                onChange={(e) => setLeaveTo(e.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={!leaveFrom || !leaveTo || leaveTo <= leaveFrom}
            onClick={() => {
              setP({
                ...p,
                leavePeriods: [
                  ...p.leavePeriods,
                  {
                    from: new Date(leaveFrom + ":00+08:00").toISOString(),
                    to: new Date(leaveTo + ":00+08:00").toISOString(),
                  },
                ],
              });
              setLeaveFrom("");
              setLeaveTo("");
            }}
          >
            加入休假
          </button>
        </fieldset>
        <div className="eng-actions">
          <button type="button" disabled={disabled} onClick={onClose}>
            關閉
          </button>
          <button className="eng-primary" disabled={disabled}>
            儲存同事設定
          </button>
        </div>
      </form>
    </section>
  );
}
