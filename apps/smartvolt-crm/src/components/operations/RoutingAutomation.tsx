"use client";
import {
  Check,
  ArrowUp,
  ArrowDown,
  Clock3,
  Plus,
  SlidersHorizontal,
  Workflow,
  X,
} from "lucide-react";
import type {
  OperationsPage,
  OperationsSettings,
  RoutingRule,
} from "@/lib/operations/model";
import type { useOperationsMutation } from "./useOperationsMutation";
type Mutation = ReturnType<typeof useOperationsMutation>;

export default function RoutingAutomation({
  page,
  config,
  configRevision,
  updateSettings,
  mutation,
  saved,
}: {
  page: OperationsPage;
  config: OperationsSettings;
  configRevision: number;
  updateSettings: (s: OperationsSettings) => void;
  mutation: Mutation;
  saved: () => void;
}) {
  function ruleChange(id: string, change: Partial<RoutingRule>) {
    updateSettings({
      ...config,
      rules: config.rules.map((r) => (r.id === id ? { ...r, ...change } : r)),
    });
  }
  function moveRule(index: number, step: number) {
    const next = [...config.rules],
      other = index + step;
    if (other < 0 || other >= next.length) return;
    [next[index], next[other]] = [next[other], next[index]];
    updateSettings({ ...config, rules: next });
  }
  return (
    <form
      className="co-automation"
      onSubmit={(e) => {
        e.preventDefault();
        void mutation
          .run({
            action: "settings",
            commandId: crypto.randomUUID(),
            revision: configRevision,
            data: config,
          })
          .then((ok) => {
            if (ok) saved();
          });
      }}
    >
      <fieldset disabled={!page.canManage || mutation.locked}>
        <section className="co-rule-section">
          <header>
            <span className="co-section-icon">
              <Workflow size={21} />
            </span>
            <div>
              <h2>新查詢，自動交到合適同事。</h2>
              <p>按規則次序配對，保留已指定嘅負責人。</p>
            </div>
            <label className="co-switch">
              <input
                type="checkbox"
                checked={config.routingEnabled}
                onChange={(e) =>
                  updateSettings({
                    ...config,
                    routingEnabled: e.target.checked,
                  })
                }
              />
              <span />
              啟用派客
            </label>
          </header>
          {config.rules.map((r, index) => (
            <article className="co-rule" key={r.id}>
              <div className="co-rule-title">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <label>
                  <span className="co-sr">規則名稱 {index + 1}</span>
                  <input
                    required
                    maxLength={60}
                    value={r.name}
                    onChange={(e) => ruleChange(r.id, { name: e.target.value })}
                  />
                </label>
                <label className="co-check">
                  <input
                    type="checkbox"
                    checked={r.enabled}
                    onChange={(e) =>
                      ruleChange(r.id, { enabled: e.target.checked })
                    }
                  />
                  使用
                </label>
                <button
                  type="button"
                  className="co-icon"
                  disabled={!index}
                  aria-label={`上移 ${r.name}`}
                  onClick={() => moveRule(index, -1)}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  className="co-icon"
                  disabled={index === config.rules.length - 1}
                  aria-label={`下移 ${r.name}`}
                  onClick={() => moveRule(index, 1)}
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  className="co-icon"
                  aria-label={`移除 ${r.name}`}
                  onClick={() =>
                    updateSettings({
                      ...config,
                      rules: config.rules.filter((x) => x.id !== r.id),
                    })
                  }
                >
                  <X size={15} />
                </button>
              </div>
              <div className="co-rule-fields">
                <label>
                  品牌
                  <select
                    value={r.brandId ?? ""}
                    onChange={(e) =>
                      ruleChange(r.id, {
                        brandId: e.target.value || null,
                      })
                    }
                  >
                    <option value="">所有品牌</option>
                    {page.brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  渠道
                  <select
                    value={r.channel}
                    onChange={(e) =>
                      ruleChange(r.id, {
                        channel: e.target.value as RoutingRule["channel"],
                      })
                    }
                  >
                    {["all", "whatsapp", "messenger", "instagram"].map((c) => (
                      <option key={c} value={c}>
                        {c === "all"
                          ? "所有渠道"
                          : c === "whatsapp"
                            ? "WhatsApp"
                            : c === "messenger"
                              ? "Messenger"
                              : "Instagram"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  交畀團隊
                  <input
                    maxLength={40}
                    value={r.team}
                    placeholder="所有同事"
                    onChange={(e) => ruleChange(r.id, { team: e.target.value })}
                  />
                </label>
                <label>
                  分派方式
                  <select
                    value={r.method}
                    onChange={(e) =>
                      ruleChange(r.id, {
                        method: e.target.value as RoutingRule["method"],
                      })
                    }
                  >
                    <option value="least_open">優先派畀工作量最少</option>
                    <option value="round_robin">輪流分派</option>
                  </select>
                </label>
                <label>
                  每人上限
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={r.maxOpen}
                    onChange={(e) =>
                      ruleChange(r.id, {
                        maxOpen: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  符合客戶標籤
                  <input
                    value={r.tags.join(", ")}
                    maxLength={410}
                    placeholder="留空適用所有客戶"
                    onChange={(e) =>
                      ruleChange(r.id, {
                        tags: e.target.value
                          .split(/[,，]/)
                          .map((x) => x.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </label>
              </div>
              <label className="co-check">
                <input
                  type="checkbox"
                  checked={r.onlineOnly}
                  onChange={(e) =>
                    ruleChange(r.id, { onlineOnly: e.target.checked })
                  }
                />
                只派畀在線同事
              </label>
            </article>
          ))}
          <button
            type="button"
            className="co-add-rule"
            disabled={config.rules.length >= 20}
            onClick={() =>
              updateSettings({
                ...config,
                rules: [
                  ...config.rules,
                  {
                    id: crypto.randomUUID(),
                    name: "新查詢分派",
                    enabled: true,
                    brandId: null,
                    channel: "all",
                    team: "",
                    tags: [],
                    method: "least_open",
                    onlineOnly: true,
                    maxOpen: 20,
                  },
                ],
              })
            }
          >
            <Plus size={16} />
            新增分派規則
          </button>
        </section>
        <section className="co-rule-section">
          <header>
            <span className="co-section-icon">
              <Clock3 size={21} />
            </span>
            <div>
              <h2>階段一轉，記低下一步。</h2>
              <p>為指定階段建立內部跟進事項。</p>
            </div>
            <label className="co-switch">
              <input
                type="checkbox"
                checked={config.followupsEnabled}
                onChange={(e) =>
                  updateSettings({
                    ...config,
                    followupsEnabled: e.target.checked,
                  })
                }
              />
              <span />
              啟用跟進
            </label>
          </header>
          <div className="co-rule-fields">
            <fieldset>
              <legend>進入以下階段</legend>
              {config.stages
                .filter((s) => s.kind === "open" && s.active)
                .map((s) => (
                  <label key={s.id} className="co-check">
                    <input
                      type="checkbox"
                      checked={config.followupStageIds.includes(s.id)}
                      onChange={(e) =>
                        updateSettings({
                          ...config,
                          followupStageIds: e.target.checked
                            ? [...config.followupStageIds, s.id]
                            : config.followupStageIds.filter((v) => v !== s.id),
                        })
                      }
                    />
                    {s.name}
                  </label>
                ))}
            </fieldset>
            <label>
              幾多分鐘後跟進
              <input
                type="number"
                min={5}
                max={43200}
                value={config.followupMinutes}
                onChange={(e) =>
                  updateSettings({
                    ...config,
                    followupMinutes: Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
        </section>
        <details className="co-stage-settings">
          <summary>
            <SlidersHorizontal size={16} />
            自訂階段名稱
          </summary>
          {config.stages.map((s, i) => (
            <div key={s.id}>
              <span className={`co-stage-badge co-tone-${s.tone}`}>
                <i />
              </span>
              <label>
                <span className="co-sr">階段名稱 {i + 1}</span>
                <input
                  required
                  maxLength={30}
                  value={s.name}
                  onChange={(e) =>
                    updateSettings({
                      ...config,
                      stages: config.stages.map((v) =>
                        v.id === s.id ? { ...v, name: e.target.value } : v,
                      ),
                    })
                  }
                />
              </label>
              <select
                aria-label={`${s.name} 階段類別`}
                disabled={page.settings.stages.some((v) => v.id === s.id)}
                value={s.kind}
                onChange={(e) =>
                  updateSettings({
                    ...config,
                    stages: config.stages.map((v) =>
                      v.id === s.id
                        ? { ...v, kind: e.target.value as typeof s.kind }
                        : v,
                    ),
                  })
                }
              >
                <option value="open">跟進中</option>
                <option value="won">成交標籤</option>
                <option value="lost">流失</option>
              </select>
              <select
                aria-label={`${s.name} 標籤顏色`}
                value={s.tone}
                onChange={(e) =>
                  updateSettings({
                    ...config,
                    stages: config.stages.map((v) =>
                      v.id === s.id
                        ? { ...v, tone: e.target.value as typeof s.tone }
                        : v,
                    ),
                  })
                }
              >
                {Object.entries({
                  slate: "灰藍",
                  blue: "藍色",
                  violet: "紫色",
                  amber: "琥珀",
                  green: "綠色",
                  rose: "玫瑰",
                }).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
              <label className="co-check">
                <input
                  type="checkbox"
                  disabled={s.id === "new"}
                  checked={s.active}
                  onChange={(e) =>
                    updateSettings({
                      ...config,
                      stages: config.stages.map((v) =>
                        v.id === s.id ? { ...v, active: e.target.checked } : v,
                      ),
                      followupStageIds: e.target.checked
                        ? config.followupStageIds
                        : config.followupStageIds.filter((v) => v !== s.id),
                    })
                  }
                />
                啟用
              </label>
            </div>
          ))}
          <button
            type="button"
            className="co-add-rule"
            disabled={config.stages.length >= 20}
            onClick={() =>
              updateSettings({
                ...config,
                stages: [
                  ...config.stages,
                  {
                    id: "stage-" + crypto.randomUUID(),
                    name: "新階段",
                    tone: "blue",
                    kind: "open",
                    active: true,
                  },
                ],
              })
            }
          >
            <Plus size={14} />
            新增階段
          </button>
        </details>
      </fieldset>
      <footer className="co-config-footer">
        <span>
          {page.canManage
            ? "儲存後套用；未能配對嘅查詢會保留喺待分派。"
            : "由擁有人或主管管理流程。"}
        </span>
        <button
          className="co-primary"
          disabled={!page.canManage || mutation.locked}
        >
          <Check size={15} />
          {mutation.busy ? "儲存中…" : "儲存流程"}
        </button>
      </footer>
    </form>
  );
}
