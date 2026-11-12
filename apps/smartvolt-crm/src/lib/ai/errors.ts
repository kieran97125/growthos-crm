export type AIErrorCode =
  | "verification_required"
  | "credits_required"
  | "budget_exhausted"
  | "authentication"
  | "rate_limited"
  | "unavailable";
export const aiErrors: Record<AIErrorCode, string> = {
  verification_required: "Vercel 需要先驗證帳戶付款方式，先可以使用 AI 模型。",
  credits_required: "Vercel AI Gateway 額度不足，需要先補充額度。",
  budget_exhausted: "AI 用量已達平台預算上限，請由營運方核對。",
  authentication: "AI 平台身份驗證未通過，請由營運方修正連線。",
  rate_limited: "模型暫時繁忙，請稍後再試；本次未有發送任何客戶訊息。",
  unavailable: "AI 暫時未能產生完整建議，請稍後再試或交由同事處理。",
};
export function classifyAIError(error: unknown): AIErrorCode {
  const pieces: string[] = [];
  let current: unknown = error;
  for (let i = 0; current && typeof current === "object" && i < 6; i++) {
    const e = current as Record<string, unknown>;
    for (const k of ["name", "message", "responseBody", "statusCode"])
      if (typeof e[k] === "string" || typeof e[k] === "number")
        pieces.push(String(e[k]).slice(0, 12000));
    current = e.cause;
  }
  const text = pieces.join(" ");
  if (
    /customer_verification_required|verify.*payment|payment.*verif|valid credit card/i.test(
      text,
    )
  )
    return "verification_required";
  if (/insufficient_funds|insufficient.*credit|402.*balance/i.test(text))
    return "credits_required";
  if (/quota_for_entity_exceeded|budget.*exceed/i.test(text))
    return "budget_exhausted";
  if (
    /GatewayAuthenticationError|invalid_api_key|no authentication|\b401\b/i.test(
      text,
    )
  )
    return "authentication";
  if (/rate_limit|\b429\b/i.test(text)) return "rate_limited";
  return "unavailable";
}
