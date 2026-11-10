/** Return actionable app errors without exposing provider payloads or credentials. */
export function gatewayFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/valid credit card|add a card|payment method.*verif/i.test(message))
    return {
      code: "gateway_activation_required",
      error:
        "真實 AI 暫未可用：Vercel 帳戶需要先完成付款方式驗證，先可以啟用 AI Gateway。你仍可選擇「示範引擎」體驗回覆流程。",
    };
  if (
    /insufficient.*credit|credit.*exhaust|quota|budget.*exceed/i.test(message)
  )
    return {
      code: "gateway_quota",
      error:
        "AI 帳戶暫時未有可用額度。請檢查模型額度，或選擇「示範引擎」體驗流程。",
    };
  return {
    code: "gateway_unavailable",
    error: "AI 服務暫未完成回覆。你可以重試，或明確改用示範引擎。",
  };
}
