"use client";
import type { Dispatch, SetStateAction } from "react";
import { Check, Settings2, X } from "lucide-react";
import type { OperationsPage } from "@/lib/operations/model";
import type { useOperationsMutation } from "./useOperationsMutation";
type Mutation = ReturnType<typeof useOperationsMutation>;

export default function TeamRouting({
  page,
  agent,
  setAgent,
  mutation,
}: {
  page: OperationsPage;
  agent: OperationsPage["members"][number] | null;
  setAgent: Dispatch<SetStateAction<OperationsPage["members"][number] | null>>;
  mutation: Mutation;
}) {
  return (
    <section>
      <div className="co-list-heading">
        <h2>
          團隊接客<small>在線狀態及手上對話</small>
        </h2>
      </div>
      <div className="co-team-grid">
        {page.members.map((m) => (
          <article className="co-agent" key={m.user_id}>
            <div className="co-agent-top">
              <span className="co-avatar">{m.display_name.slice(0, 1)}</span>
              <div>
                <h3>{m.display_name}</h3>
                <span className={`co-presence co-presence-${m.presence}`}>
                  <i />
                  {m.paused
                    ? "已暫停接客"
                    : {
                        online: "在線接客",
                        away: "暫離",
                        offline: "離線",
                      }[m.presence]}
                </span>
              </div>
              {page.canManage && (
                <button
                  className="co-icon"
                  aria-label={`調整 ${m.display_name} 接客設定`}
                  disabled={mutation.locked}
                  onClick={() => setAgent(m)}
                >
                  <Settings2 size={16} />
                </button>
              )}
            </div>
            <div className="co-load-meter">
              <strong>
                {m.open_count}
                <small> / {m.capacity}</small>
              </strong>
              <span>未完成對話</span>
              <div>
                <i
                  style={{
                    width: `${Math.min(100, (m.open_count / m.capacity) * 100)}%`,
                  }}
                />
              </div>
            </div>
            <footer>
              {m.team || "全體團隊"}
              <span>
                {m.brand_ids.length
                  ? `${m.brand_ids.length} 個品牌`
                  : "所有品牌"}
              </span>
            </footer>
          </article>
        ))}
      </div>
      {agent && (
        <form
          className="co-inline-editor"
          aria-label="同事接客設定"
          onSubmit={(e) => {
            e.preventDefault();
            void mutation
              .run({
                action: "agent",
                commandId: crypto.randomUUID(),
                userId: agent.user_id,
                revision: agent.revision,
                team: agent.team,
                capacity: agent.capacity,
                brandIds: agent.brand_ids,
                paused: agent.paused,
              })
              .then((ok) => {
                if (ok) setAgent(null);
              });
          }}
        >
          <div>
            <strong>{agent.display_name}</strong>
            <button
              type="button"
              className="co-icon"
              disabled={mutation.locked}
              onClick={() => setAgent(null)}
              aria-label="取消接客設定"
            >
              <X size={16} />
            </button>
          </div>
          <label>
            團隊
            <input
              maxLength={40}
              value={agent.team}
              disabled={mutation.locked}
              onChange={(e) => setAgent({ ...agent, team: e.target.value })}
              placeholder="例如：預約組"
            />
          </label>
          <label>
            接客上限
            <input
              type="number"
              min={1}
              max={500}
              value={agent.capacity}
              disabled={mutation.locked}
              onChange={(e) =>
                setAgent({ ...agent, capacity: Number(e.target.value) })
              }
            />
          </label>
          <fieldset>
            <legend>接待品牌（留空代表所有）</legend>
            {page.brands.map((b) => (
              <label className="co-check" key={b.id}>
                <input
                  type="checkbox"
                  disabled={mutation.locked}
                  checked={agent.brand_ids.includes(b.id)}
                  onChange={(e) =>
                    setAgent({
                      ...agent,
                      brand_ids: e.target.checked
                        ? [...agent.brand_ids, b.id]
                        : agent.brand_ids.filter((x) => x !== b.id),
                    })
                  }
                />
                {b.name}
              </label>
            ))}
          </fieldset>
          <label className="co-check">
            <input
              type="checkbox"
              checked={agent.paused}
              disabled={mutation.locked}
              onChange={(e) => setAgent({ ...agent, paused: e.target.checked })}
            />
            暫停自動派客
          </label>
          <button className="co-primary" disabled={mutation.locked}>
            <Check size={15} />
            儲存接客設定
          </button>
        </form>
      )}
    </section>
  );
}
