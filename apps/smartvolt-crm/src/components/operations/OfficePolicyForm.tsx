"use client";
import { useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { officePolicy, type OfficePolicy } from "@/lib/operations/supervision";
const weekdays = [
  "星期一",
  "星期二",
  "星期三",
  "星期四",
  "星期五",
  "星期六",
  "星期日",
];
const zones: Record<string, string> = {
  "Asia/Hong_Kong": "香港",
  "Asia/Taipei": "台北",
  "Asia/Singapore": "新加坡",
  "Asia/Tokyo": "東京",
  "Australia/Sydney": "悉尼",
  "Europe/London": "倫敦",
  "America/New_York": "紐約",
  "America/Los_Angeles": "洛杉磯",
  UTC: "UTC",
};
const clock = (n: number) =>
  String(Math.floor((n % 1440) / 60)).padStart(2, "0") +
  ":" +
  String(n % 60).padStart(2, "0");
const minutes = (v: string, end = false) => {
  const [h, m] = v.split(":").map(Number);
  return end && h === 0 && m === 0 ? 1440 : h * 60 + m;
};
export default function OfficePolicyForm({
  initial,
  disabled,
  onSave,
}: {
  initial: OfficePolicy;
  disabled: boolean;
  onSave: (d: OfficePolicy) => void;
}) {
  const [data, setData] = useState(initial),
    [holiday, setHoliday] = useState(""),
    [error, setError] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    const result = officePolicy.safeParse(data);
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "請核對辦公時間。");
      return;
    }
    setError("");
    onSave(result.data);
  }
  return (
    <form onSubmit={submit}>
      <fieldset disabled={disabled} className="eng-form-fields">
        <label>
          希望幾多分鐘內回覆？
          <input
            type="number"
            min={1}
            max={10080}
            required
            value={data.responseMinutes}
            onChange={(e) =>
              setData((v) => ({
                ...v,
                responseMinutes: Number(e.target.value),
              }))
            }
          />
        </label>
        <label className="sup-check">
          <input
            type="checkbox"
            checked={data.hoursEnabled}
            onChange={(e) =>
              setData((v) => ({ ...v, hoursEnabled: e.target.checked }))
            }
          />
          只計辦公時間
        </label>
        <p className="eng-hint">
          {data.hoursEnabled
            ? "收工、休息日同假期會暫停計時。"
            : "目前全天計時，包括週末。"}{" "}
          新設定只用於之後收到嘅新一輪查詢。
        </p>
        {data.hoursEnabled && (
          <>
            <label>
              辦公時區
              <select
                value={data.timeZone}
                onChange={(e) =>
                  setData((v) => ({ ...v, timeZone: e.target.value }))
                }
              >
                {Object.entries({
                  ...zones,
                  ...(!zones[data.timeZone]
                    ? { [data.timeZone]: data.timeZone }
                    : {}),
                }).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <div className="sup-weekly">
              {weekdays.map((day, i) => {
                const slots = data.weekly
                  .map((s, index) => ({ ...s, index }))
                  .filter((s) => s.day === i + 1);
                return (
                  <div className="sup-day" key={day}>
                    <label className="sup-check">
                      <input
                        type="checkbox"
                        checked={slots.length > 0}
                        onChange={(e) =>
                          setData((v) => ({
                            ...v,
                            weekly: e.target.checked
                              ? [
                                  ...v.weekly,
                                  { day: i + 1, start: 540, end: 1080 },
                                ]
                              : v.weekly.filter((s) => s.day !== i + 1),
                          }))
                        }
                      />
                      {day}
                    </label>
                    <div>
                      {slots.length ? (
                        slots.map((s) => (
                          <div className="sup-slot" key={s.index}>
                            <input
                              aria-label={day + "開始時間"}
                              type="time"
                              required
                              value={clock(s.start)}
                              onChange={(e) =>
                                setData((v) => ({
                                  ...v,
                                  weekly: v.weekly.map((x, j) =>
                                    j === s.index
                                      ? { ...x, start: minutes(e.target.value) }
                                      : x,
                                  ),
                                }))
                              }
                            />
                            <span>至</span>
                            <input
                              aria-label={day + "結束時間"}
                              type="time"
                              required
                              value={clock(s.end)}
                              onChange={(e) =>
                                setData((v) => ({
                                  ...v,
                                  weekly: v.weekly.map((x, j) =>
                                    j === s.index
                                      ? {
                                          ...x,
                                          end: minutes(e.target.value, true),
                                        }
                                      : x,
                                  ),
                                }))
                              }
                            />
                            {slots.length > 1 && (
                              <button
                                type="button"
                                aria-label={"移除" + day + "時段"}
                                onClick={() =>
                                  setData((v) => ({
                                    ...v,
                                    weekly: v.weekly.filter(
                                      (_, j) => j !== s.index,
                                    ),
                                  }))
                                }
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        ))
                      ) : (
                        <span className="eng-hint">休息</span>
                      )}
                      {slots.length > 0 && data.weekly.length < 21 && (
                        <button
                          type="button"
                          className="sup-add-slot"
                          onClick={() =>
                            setData((v) => ({
                              ...v,
                              weekly: [
                                ...v.weekly,
                                {
                                  day: i + 1,
                                  start:
                                    slots.at(-1)!.end === 1440
                                      ? 0
                                      : slots.at(-1)!.end,
                                  end:
                                    slots.at(-1)!.end === 1440
                                      ? 60
                                      : Math.min(1440, slots.at(-1)!.end + 60),
                                },
                              ],
                            }))
                          }
                        >
                          <Plus size={12} />
                          加時段
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="eng-hint">
              結束選 00:00 代表當晚午夜；跨午夜工作可分成兩日時段。
            </p>
            <label>
              額外休息日
              <div className="sup-holiday-add">
                <input
                  aria-label="休息日日期"
                  type="date"
                  value={holiday}
                  onChange={(e) => setHoliday(e.target.value)}
                />
                <button
                  type="button"
                  disabled={
                    !holiday ||
                    data.holidays.includes(holiday) ||
                    data.holidays.length >= 366
                  }
                  onClick={() => {
                    setData((v) => ({
                      ...v,
                      holidays: [...v.holidays, holiday].sort(),
                    }));
                    setHoliday("");
                  }}
                >
                  加入
                </button>
              </div>
            </label>
            <div className="eng-tags">
              {data.holidays.map((d) => (
                <span key={d}>
                  {d}
                  <button
                    type="button"
                    aria-label={"移除休息日" + d}
                    onClick={() =>
                      setData((v) => ({
                        ...v,
                        holidays: v.holidays.filter((x) => x !== d),
                      }))
                    }
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          </>
        )}
      </fieldset>
      {error && (
        <p role="alert" className="eng-alert">
          {error}
        </p>
      )}
      <footer className="eng-dialog-footer">
        <span className="eng-hint">唔會改寫之前嘅計時紀錄</span>
        <button className="eng-primary" disabled={disabled}>
          儲存辦公時間
        </button>
      </footer>
    </form>
  );
}
