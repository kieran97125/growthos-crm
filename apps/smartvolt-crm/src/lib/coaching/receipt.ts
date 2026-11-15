import { z } from "zod";
import { AccessError } from "@/lib/saas/identity";
import { aiErrors, type AIErrorCode } from "@/lib/ai/errors";
import type { CoachingAnalysis } from "./model";

/** Only a persisted failed receipt is terminal; transport/RPC errors remain uncertain. */
export class CoachingError extends AccessError {
  readonly terminalFailure = true;
  constructor(
    message: string,
    status: number,
    public readonly code: string,
  ) {
    super(message, status);
  }
}

const receiptSchema = z.object({
  status: z.enum(["running", "completed", "failed"]),
  result: z.unknown().optional(),
  error_code: z.string().max(100).nullable().optional(),
});
const changed = new Set([
  "context_changed",
  "source_changed",
  "interrupted",
  "disabled",
]);
export function coachingReceipt(
  raw: unknown,
): { state: "running" } | { analysis: CoachingAnalysis } {
  const checked = receiptSchema.safeParse(raw);
  if (!checked.success)
    throw new AccessError("暫時未能確認分析結果，請稍後核對同一請求。", 503);
  const row = checked.data;
  if (row.status === "running") return { state: "running" };
  if (
    row.status === "completed" &&
    row.result &&
    typeof row.result === "object"
  )
    return { analysis: row.result as CoachingAnalysis };
  if (row.status !== "failed")
    throw new AccessError(
      "暫時未能讀取已儲存嘅分析，請稍後核對同一請求。",
      503,
    );
  if (changed.has(row.error_code ?? ""))
    throw new CoachingError(
      "分析期間資料或設定有變，未有套用；請重新讀取後再分析。",
      409,
      row.error_code!,
    );
  const code: AIErrorCode = Object.hasOwn(aiErrors, row.error_code ?? "")
    ? (row.error_code as AIErrorCode)
    : "unavailable";
  throw new CoachingError(aiErrors[code], 503, code);
}

export function terminalCoachingFailure(error: unknown) {
  if (!(error instanceof CoachingError)) return null;
  return {
    status: error.status,
    body: {
      error: error.message,
      terminalFailure: true as const,
      code: error.code,
    },
  };
}
