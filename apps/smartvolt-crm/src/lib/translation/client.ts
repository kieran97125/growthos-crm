import {
  translationResult,
  type TranslationRequest,
  type TranslationResult,
} from "./model";
type Input =
  | Omit<Extract<TranslationRequest, { mode: "message" }>, "requestId">
  | Omit<Extract<TranslationRequest, { mode: "draft" }>, "requestId">;
type Attempt = {
  body: TranslationRequest;
  promise?: Promise<TranslationResult>;
  result?: TranslationResult;
  at: number;
};
const attempts = new Map<string, Attempt>();

/** Keep the same UUID after network loss. No automatic request retry or send. */
export async function requestTranslation(input: Input, sourceVersion?: string) {
  const key = JSON.stringify({ input, sourceVersion });
  let attempt = attempts.get(key);
  if (attempt?.result) return attempt.result;
  if (attempt?.promise) return attempt.promise;
  if (!attempt) {
    // Pending outcomes retain their UUID. Evict completed/old idle entries only.
    for (const [k, v] of attempts)
      if (v.result && (attempts.size >= 100 || v.at < Date.now() - 1800000))
        attempts.delete(k);
    if (attempts.size >= 200)
      throw Error("未完成嘅翻譯較多，請先核對之前結果。重新載入後亦可繼續。");
    attempt = {
      body: { ...input, requestId: crypto.randomUUID() },
      at: Date.now(),
    };
    attempts.set(key, attempt);
  }
  const current = attempt;
  current.promise = (async () => {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(current.body),
      signal: AbortSignal.timeout(65000),
    }).catch(() => {
      throw Error("連線中斷，請按同一個翻譯按鈕核對結果。原文仍然保留。");
    });
    const data = await response.json();
    if (response.status === 202 && data.state === "running")
      throw Error("仍在翻譯，請稍後按同一個按鈕核對結果。");
    if (!response.ok) {
      if (data.code || response.status < 500) attempts.delete(key);
      throw Error(
        data.error ?? "連線結果未確認，請按同一個按鈕再試。原文仍然保留。",
      );
    }
    const result = translationResult.parse(data);
    if (result.target !== input.target)
      throw Error("譯文語言未能核對，請再試。");
    current.result = result;
    return result;
  })();
  try {
    return await current.promise;
  } finally {
    current.promise = undefined;
  }
}
