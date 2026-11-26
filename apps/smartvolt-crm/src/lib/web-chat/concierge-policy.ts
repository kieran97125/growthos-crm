import { websitePrivacyHandoff } from "./visitor-privacy";

/** Visitor preferences are separate from assignment and the human-response queue. */
export type ChatPreference = "cooperate" | "human_only";
export type ChatTurnKind = "message" | "human" | "human_only" | "resume_c";
export type ChatIntent =
  "features" | "pricing" | "demo" | "integration" | "support" | "unknown";
export const chatIntentLabels: Record<ChatIntent, string> = {
  features: "了解產品功能",
  pricing: "方案與收費",
  demo: "安排產品示範",
  integration: "接駁現有工具",
  support: "使用支援",
  unknown: "需要進一步了解",
};
export function assessChatTurn(body: string, kind: ChatTurnKind = "message") {
  const text = body.normalize("NFKC").toLowerCase();
  const declinesHuman =
    /(?:唔使|唔需要|不用|不需要|不要|唔想|唔好|唔係要).{0,5}(?:真人|人工|客服)|(?:don['’]?t|do not|no need).{0,15}(?:human|agent|person)/i.test(
      text,
    );
  const humanOnly =
    kind === "human_only" ||
    /(?:只|淨|净|剩).{0,5}(?:真人|人工|客服)|(?:唔好|不要|不用|唔想|停止).{0,5}(?:ai|機械人|機器人|自動回覆)|(?:only|just).{0,12}(?:human|person)|(?:human|person).{0,5}only|(?:no|stop).{0,5}(?:ai|bot)/i.test(
      text,
    );
  const resume =
    kind === "resume_c" ||
    /(?:c|ai).{0,8}(?:幫我答|答返|先答|幫手解答|繼續答|繼續幫)|(?:可以|請|叫).{0,5}(?:c|ai).{0,5}(?:幫|答)|(?:ai|bot).{0,8}(?:please answer|can answer)/i.test(
      text,
    );
  const human =
    websitePrivacyHandoff(body) ||
    kind === "human" ||
    humanOnly ||
    (!resume &&
      !declinesHuman &&
      /(?:想|要|搵|找|轉|叫|接駁|安排|聯絡|联系).{0,12}(?:真人|人工客服|客服同事)|(?:speak|talk|connect|transfer).{0,20}(?:human|agent|person)|(?:真人客服|human agent)/i.test(
        text,
      ));
  const intent: ChatIntent =
    /(?:幾錢|價錢|價格|收費|報價|費用|pricing|price|cost)/i.test(text)
      ? "pricing"
      : /(?:示範|demo|demonstration)/i.test(text)
        ? "demo"
        : /(?:接駁|整合|api|wordpress|wix|integrat|connect)/i.test(text)
          ? "integration"
          : /(?:出錯|故障|唔得|用唔到|問題|error|broken|support|help with)/i.test(
                text,
              )
            ? "support"
            : /(?:功能|介紹|可以點|做到|幫到|feature|what.*do)/i.test(text)
              ? "features"
              : "unknown";
  return {
    human,
    preference: humanOnly
      ? ("human_only" as const)
      : resume
        ? ("cooperate" as const)
        : null,
    intent,
    intentLabel: chatIntentLabels[intent],
    intentBasis: intent === "unknown" ? "unknown" : "stated",
    summary: body.trim().slice(0, 400),
    nextQuestion: body.trim().slice(0, 400),
  };
}
export const humanAcknowledgement =
  "收到，我已將你嘅查詢交到客服工作台，請稍等，客服會盡快回覆你。";
export const knowledgeHandoff =
  "呢個問題需要同事再核實，我已將問題交到客服工作台，客服會盡快喺呢度回覆你。";
