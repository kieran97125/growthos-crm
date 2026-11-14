"use client";
import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { recipeNames, recipeDescriptions } from "@/lib/engagement/journeys";
import type { EngagementPage, MessageDefinition } from "@/lib/engagement/model";
import MessageFields from "./MessageFields";
export default function JourneyBuilder({
  companyId,
  recipe,
  engagement,
  busy,
  frozen,
  error,
  onSubmit,
  onRetry,
}: {
  companyId: string;
  recipe: keyof typeof recipeNames;
  engagement: EngagementPage;
  busy: boolean;
  frozen: boolean;
  error: string;
  onSubmit: (c: unknown) => Promise<void>;
  onRetry: () => void;
}) {
  const [brand, setBrand] = useState(engagement.brands[0]?.id ?? ""),
    [connection, setConnection] = useState(""),
    [purpose, setPurpose] = useState<"marketing" | "service">("service"),
    [steps, setSteps] = useState<
      { id: string; delayMinutes: number; definition: MessageDefinition }[]
    >([
      {
        id: "first",
        delayMinutes: recipe === "appointment" ? 1440 : 60,
        definition: { kind: "text", body: "", values: [] },
      },
    ]);
  const selected = engagement.connections.find(
    (c) => c.id === connection && c.brand_id === brand,
  );
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (frozen) {
      onRetry();
      return;
    }
    if (!selected) return;
    const f = new FormData(e.currentTarget);
    void onSubmit({
      action: "publish",
      commandId: crypto.randomUUID(),
      id: crypto.randomUUID(),
      name: String(f.get("name")),
      brandId: brand,
      provider: selected.provider,
      connectionId: connection,
      recipe,
      purpose,
      enabled: true,
      revision: 0,
      steps: steps.map(({ delayMinutes, definition }) => ({
        delayMinutes,
        definition,
      })),
    });
  }
  return (
    <form onSubmit={submit}>
      <fieldset disabled={busy || frozen} className="eng-form-fields">
        <p className="eng-hint">
          {recipeDescriptions[recipe]} 每次只使用仍然有效嘅客戶及預約資料。
        </p>
        <label>
          流程名稱
          <input
            name="name"
            required
            maxLength={100}
            defaultValue={recipeNames[recipe]}
          />
        </label>
        <div className="eng-two">
          <label>
            品牌
            <select
              value={brand}
              onChange={(e) => {
                setBrand(e.target.value);
                setConnection("");
              }}
            >
              {engagement.brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            發送渠道
            <select
              required
              value={connection}
              onChange={(e) => setConnection(e.target.value)}
            >
              <option value="">選擇渠道</option>
              {engagement.connections
                .filter((c) => c.brand_id === brand)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} · {c.channel}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <label>
          訊息用途
          <select
            value={purpose}
            onChange={(e) => setPurpose(e.target.value as typeof purpose)}
          >
            <option value="service">服務通知</option>
            <option value="marketing">營銷訊息</option>
          </select>
        </label>
        {steps.map((step, i) => (
          <section className="eng-journey-step" key={step.id}>
            <div>
              <h3>第 {i + 1} 次跟進</h3>
              {steps.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setSteps((all) => all.filter((s) => s.id !== step.id))
                  }
                >
                  移除
                </button>
              )}
            </div>
            <label>
              {recipe === "appointment" ? "預約前幾多分鐘" : "發生後幾多分鐘"}
              <input
                type="number"
                min={5}
                max={43200}
                required
                value={step.delayMinutes}
                onChange={(e) =>
                  setSteps((all) =>
                    all.map((s) =>
                      s.id === step.id
                        ? { ...s, delayMinutes: Number(e.target.value) }
                        : s,
                    ),
                  )
                }
              />
            </label>
            {selected ? (
              <MessageFields
                key={selected.id + purpose + step.id}
                companyId={companyId}
                connection={selected}
                purpose={purpose}
                initialTemplates={engagement.templates}
                value={step.definition}
                onChange={(definition) =>
                  setSteps((all) =>
                    all.map((s) =>
                      s.id === step.id ? { ...s, definition } : s,
                    ),
                  )
                }
              />
            ) : (
              <p className="eng-hint">先揀選渠道，就可以準備訊息。</p>
            )}
          </section>
        ))}
        {steps.length < 4 && (
          <button
            type="button"
            onClick={() =>
              setSteps((all) => [
                ...all,
                {
                  id: crypto.randomUUID(),
                  delayMinutes:
                    recipe === "appointment"
                      ? Math.max(5, all.at(-1)!.delayMinutes - 60)
                      : all.at(-1)!.delayMinutes + 4320,
                  definition: { kind: "text", body: "", values: [] },
                },
              ])
            }
          >
            <Plus size={15} />
            加一次跟進
          </button>
        )}
        <p className="eng-hint">
          預約提醒由較早時間排到較近時間；其他跟進由短至長。多次訊息亦要符合公司聯絡頻率。
        </p>
      </fieldset>
      {error && (
        <p role="alert" className="eng-alert">
          {error}
        </p>
      )}
      <footer className="eng-dialog-footer">
        <span className="eng-hint">客人退出或真人接手會停低舊跟進</span>
        {frozen ? (
          <button
            type="button"
            className="eng-primary"
            disabled={busy}
            onClick={onRetry}
          >
            核對同一請求
          </button>
        ) : (
          <button className="eng-primary" disabled={busy || !selected}>
            啟用流程
          </button>
        )}
      </footer>
    </form>
  );
}
