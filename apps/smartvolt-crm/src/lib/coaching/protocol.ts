import type { Article } from "@/components/crm/studio/model";
import { prices } from "@/lib/ai/protocol";
import {
  outputSchema,
  lossLabels,
  type CoachingMessage,
  type CoachingOutput,
} from "./model";

const personal = /[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?\d[\d ()-]{6,}\d)/gi;
/** Learning text is reusable brand material; message evidence stays private. */
export function sanitizeLearningText(
  text: string,
  privateNames: string[] = [],
) {
  let safe = text.normalize("NFKC").replace(personal, "[個人資料]");
  for (const name of privateNames
    .map((v) => v.normalize("NFKC").trim())
    .filter((v) => v.length >= 2)) {
    safe = safe.replace(
      new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu"),
      "[客戶]",
    );
  }
  return safe.trim();
}
function groundedBusinessText(
  text: string,
  evidence: { sourceId: string; quote: string }[],
  articles: Article[],
) {
  if (
    evidence.some(
      (e) =>
        !articles.some(
          (a) => a.id === e.sourceId && a.content.includes(e.quote),
        ),
    )
  )
    return false;
  const facts = articles
    .filter((a) => evidence.some((e) => e.sourceId === a.id))
    .map((a) => a.content + " " + a.source)
    .join("\n");
  const amounts = new Set(prices(facts));
  if (prices(text).some((p) => !amounts.has(p))) return false;
  if (
    [...text.matchAll(/https?:\/\/[^\s<>「」]+/g)].some(
      (m) => !facts.includes(m[0]),
    )
  )
    return false;
  return !/(?:已為你預約|預約已確認|成功預約|保證有位|一定有位|保證有效|百分百有效|已收到.*(?:訂金|付款))/.test(
    text,
  );
}
export function inspectCoachingOutput(
  raw: unknown,
  messages: CoachingMessage[],
  articles: Article[],
  options: {
    verifiedBooking: boolean;
    truncated: boolean;
    privateNames?: string[];
  },
): CoachingOutput {
  const output = outputSchema.parse(raw);
  const quoteValid = (e: { messageId: string; quote: string }) =>
    messages.some((m) => m.id === e.messageId && m.body.includes(e.quote));
  const allEvidence = [
    ...output.nextAction.evidence,
    ...output.quality.findings.flatMap((f) => f.evidence),
    ...output.quality.lossReason.evidence,
    ...output.learning.flatMap((l) => l.evidence),
  ];
  if (!allEvidence.every(quoteValid))
    throw new Error("coaching_invalid_evidence");
  if (
    !groundedBusinessText(
      output.nextAction.suggestedReply,
      output.nextAction.knowledgeEvidence,
      articles,
    )
  ) {
    output.nextAction.suggestedReply = "";
    output.nextAction.title = "先核實資料再回覆";
    output.nextAction.reason =
      "建議草稿包含未能核實嘅資料，請由同事核對品牌知識及客戶需要。";
  } else if (
    output.nextAction.suggestedReply &&
    !output.nextAction.knowledgeEvidence.length
  ) {
    // Without approved facts, only a neutral clarification may reach the composer.
    const field = [
      ["分店", /分店|地點|位置/],
      ["日期", /日期|日子/],
      ["時間", /時間|時段/],
      ["服務", /服務|療程|項目/],
      ["人數", /人數/],
    ] as const;
    const label = field.find(([, re]) =>
      output.nextAction.missingFields.some((value) => re.test(value)),
    )?.[0];
    output.nextAction.suggestedReply = label
      ? `想先了解你心儀嘅${label}，方便同事跟進，可以話我哋知嗎？`
      : "想先了解你而家最想解決嘅需要，可以同我哋講多少少嗎？";
  }
  // A reason for hesitation is a tentative customer signal, never an observed loss.
  const loss = output.quality.lossReason;
  if (
    loss.code !== "unknown" &&
    (!loss.evidence.length ||
      !loss.evidence.some((e) =>
        messages.some(
          (m) => m.id === e.messageId && m.direction === "incoming",
        ),
      ))
  ) {
    output.quality.lossReason = {
      code: "unknown",
      label: lossLabels.unknown,
      evidence: [],
    };
  } else loss.label = lossLabels[loss.code];
  if (
    !messages.some((m) => m.direction === "incoming") ||
    !messages.some((m) => m.direction === "outgoing")
  ) {
    output.quality.status = "insufficient";
    output.quality.findings = [];
  }
  const names = options.privateNames ?? [];
  output.learning = output.learning.filter((l) => {
    // Questions without answers are knowledge gaps, not publishable facts.
    if (
      l.kind === "answer" &&
      (!l.knowledgeEvidence.length ||
        !groundedBusinessText(l.content, l.knowledgeEvidence, articles))
    )
      return false;
    if (
      l.kind === "answer" &&
      !articles.some(
        (article) =>
          l.knowledgeEvidence.some((e) => e.sourceId === article.id) &&
          article.content.includes(l.content),
      ) &&
      l.content !== l.knowledgeEvidence.map((e) => e.quote).join("\n")
    )
      return false;
    // Communication patterns cannot smuggle factual policies into style guidance.
    if (
      l.kind === "pattern" &&
      [l.title, l.question, l.content].some(
        (v) =>
          prices(v).length ||
          /https?:\/\/|(?:保證|一定|百分百|療效|治療|醫療|折扣|收費|營業時間|退款政策)/i.test(
            v,
          ),
      )
    )
      return false;
    return [l.title, l.question, l.content].every(
      (v) => sanitizeLearningText(v, names) === v.normalize("NFKC").trim(),
    );
  });
  // Merely observing useful wording does not establish that it caused a booking.
  for (const item of output.learning) {
    if (!options.verifiedBooking) {
      item.title = item.title.replace(
        /成功預約|成交成功|高轉化|有效成交/g,
        "候選話術",
      );
      item.content = item.content.replace(
        /成功預約|成交成功|高轉化|有效成交/g,
        "候選溝通方式",
      );
    }
  }
  return output;
}

export function validateAdoption(
  item: CoachingOutput["learning"][number],
  title: string,
  content: string,
  articles: Article[],
  privateNames: string[],
) {
  if (item.kind === "gap") throw new Error("coaching_gap_not_publishable");
  if (
    [title, content].some(
      (v) =>
        sanitizeLearningText(v, privateNames) !== v.normalize("NFKC").trim(),
    )
  )
    throw new Error("coaching_personal_data");
  if (
    item.kind === "pattern" &&
    [title, item.question, content].some(
      (v) =>
        prices(v).length ||
        /https?:\/\/|(?:保證|一定|百分百|療效|治療|醫療|折扣|收費|營業時間|退款政策)/i.test(
          v,
        ),
    )
  )
    throw new Error("coaching_pattern_not_policy");
  if (item.kind === "answer") {
    if (!groundedBusinessText(content, item.knowledgeEvidence, articles))
      throw new Error("coaching_knowledge_changed");
    // A learned answer is an exact approved fact extract. New facts use the normal editor.
    const excerpts = item.knowledgeEvidence.map((e) => e.quote).join("\n");
    const cited = articles.filter((a) =>
      item.knowledgeEvidence.some((e) => e.sourceId === a.id),
    );
    if (
      content !== item.content ||
      (!cited.some((a) => a.content.includes(content)) && content !== excerpts)
    )
      throw new Error("coaching_answer_edit_requires_knowledge");
  }
}
