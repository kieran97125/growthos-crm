"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import {
  lossCodes,
  lossLabels,
  type CoachingAnalysis,
  type CoachingCommand,
} from "@/lib/coaching/model";
import { coachingCommand, knownFailure } from "./client";
type ReviewCommand = Extract<CoachingCommand, { type: "review" }>;
export default function QualityReview({
  companyId,
  analysis,
  disabled,
  onSaved,
}: {
  companyId: string;
  analysis: CoachingAnalysis;
  disabled: boolean;
  onSaved: () => Promise<unknown> | void;
}) {
  const [lossCode, setLossCode] = useState(
      analysis.latestReview?.lossCode ?? analysis.quality.lossReason.code,
    ),
    [reason, setReason] = useState(""),
    [dismissed, setDismissed] = useState<string[]>(
      analysis.latestReview?.dismissedFindingCodes ?? [],
    ),
    [pending, setPending] = useState<ReviewCommand | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save() {
    if (busy || disabled) return;
    const command: ReviewCommand = pending ?? {
      type: "review",
      commandId: crypto.randomUUID(),
      analysisId: analysis.id,
      lossCode,
      reason,
      dismissedFindingCodes:
        dismissed as ReviewCommand["dismissedFindingCodes"],
    };
    setPending(command);
    setBusy(true);
    setError("");
    try {
      await coachingCommand(companyId, command);
      setPending(null);
      setReason("");
      await onSaved();
    } catch (e) {
      if (knownFailure(e)) setPending(null);
      setError(
        e instanceof Error ? e.message : "覆核結果未能確認，請核對同一操作。",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="coach-review">
      <summary>覆核判斷</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label>
          實際顧慮
          <select
            value={lossCode}
            disabled={disabled || busy || !!pending}
            onChange={(e) => setLossCode(e.target.value as typeof lossCode)}
          >
            {lossCodes.map((code) => (
              <option key={code} value={code}>
                {lossLabels[code]}
              </option>
            ))}
          </select>
        </label>
        {!!analysis.quality.findings.length && (
          <p className="coach-muted">勾選不適用嘅改善建議</p>
        )}
        {[
          ...new Map(
            analysis.quality.findings.map((finding) => [finding.code, finding]),
          ).values(),
        ].map((finding) => (
          <label className="coach-review-check" key={finding.code}>
            <input
              type="checkbox"
              checked={dismissed.includes(finding.code)}
              disabled={disabled || busy || !!pending}
              onChange={(e) =>
                setDismissed((old) =>
                  e.target.checked
                    ? [...old, finding.code]
                    : old.filter((code) => code !== finding.code),
                )
              }
            />
            {finding.title}
          </label>
        ))}
        <label>
          覆核原因
          <textarea
            required
            minLength={3}
            maxLength={500}
            rows={3}
            value={reason}
            disabled={disabled || busy || !!pending}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {error && (
          <p className="coach-alert" role="alert">
            {error}
          </p>
        )}
        <button
          className="coach-primary"
          disabled={disabled || busy || reason.trim().length < 3}
        >
          <Check size={13} aria-hidden="true" />
          {busy ? "儲存中…" : pending ? "核對同一覆核" : "儲存覆核"}
        </button>
      </form>
    </details>
  );
}
