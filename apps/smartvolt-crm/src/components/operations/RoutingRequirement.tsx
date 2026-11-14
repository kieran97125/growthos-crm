"use client";
import { useState } from "react";
import useSWR from "swr";
import type { RosterPage } from "@/lib/operations/roster";
import { engagementFetcher } from "@/components/engagement/fetcher";
import { useRecordedCommand } from "@/components/engagement/useRecordedCommand";
export default function RoutingRequirement({
  companyId,
  provider,
  threadId,
  canEdit,
}: {
  companyId: string;
  provider: "whatsapp" | "meta";
  threadId: string;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false),
    url = `/api/companies/${companyId}/roster`,
    { data, error, mutate } = useSWR<RosterPage>(
      open
        ? url + "?" + new URLSearchParams({ provider, thread: threadId })
        : null,
      engagementFetcher,
    ),
    c = useRecordedCommand(url, () => mutate());
  return (
    <details
      className="co-card"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>派客條件</summary>
      {error && <p role="alert">{error.message}</p>}
      {data && (
        <form
          key={data.requirement.revision}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void c.send({
              action: "requirement",
              commandId: crypto.randomUUID(),
              provider,
              threadId,
              branchId: String(f.get("branch")) || null,
              skills: [
                ...new Set(
                  String(f.get("skills"))
                    .split(/[,，]/)
                    .map((x) => x.trim())
                    .filter(Boolean),
                ),
              ],
              revision: data.requirement.revision,
            });
          }}
        >
          <fieldset disabled={!canEdit || c.busy || c.frozen}>
            <label>
              分店
              <select
                name="branch"
                defaultValue={data.requirement.branchId ?? ""}
              >
                <option value="">不限分店</option>
                {data.branches
                  .filter((b) => b.active || b.id === data.requirement.branchId)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              需要專長（逗號分開）
              <input
                name="skills"
                defaultValue={data.requirement.skills.join(",")}
                maxLength={1000}
              />
            </label>
            <p>之後自動派客會核對條件；唔會更換目前負責人。</p>
            <button>儲存條件</button>
          </fieldset>
        </form>
      )}
      {(c.error || c.notice) && (
        <p role={c.error ? "alert" : "status"}>{c.error || c.notice}</p>
      )}
      {c.frozen && (
        <button disabled={c.busy} onClick={() => void c.retry()}>
          核對同一請求
        </button>
      )}
    </details>
  );
}
