import type { CheerioAPI } from "cheerio";
import { load } from "cheerio";
import type { WebsitePage } from "./model";

export type WebsiteFaq = { question: string; answer: string };
export const cleanWebsiteText = (text: string) =>
  text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t\r]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const questions: Record<WebsitePage["category"], string> = {
  overview: "你哋主要提供咩服務？",
  about: "可以介紹一下你哋嘅品牌嗎？",
  services: "有咩服務同產品可以選擇？",
  contact: "點樣聯絡你哋？",
  faq: "有咩常見問題需要了解？",
  policy: "有咩使用條款或政策需要了解？",
};
function headingQuestion(heading: string) {
  const h = cleanWebsiteText(heading).replace(/[。.!！:：]+$/, "");
  if (/[?？]$/.test(h)) return h.slice(0, 100);
  if (/^(what|why|how|when|where|can|do|is|are|does|will)\b/i.test(h))
    return h.slice(0, 99) + "?";
  if (/幾多|幾點|點樣|點解|可唔可以|如何|是否|什麼|甚麼|哪些/.test(h))
    return h.slice(0, 99) + "？";
  if (/聯絡|聯繫|contact/i.test(h)) return "點樣聯絡你哋？";
  if (/營業時間|opening hours|business hours/i.test(h))
    return "營業時間係幾點？";
  if (/地址|分店|location|find us/i.test(h)) return "你哋嘅地址喺邊？";
  if (/私隱|隱私|privacy/i.test(h)) return "你哋點樣處理個人資料？";
  if (/退款|退換|refund/i.test(h)) return "退款或退換安排係點？";
  if (/收費|價錢|pricing|prices/i.test(h)) return "服務收費係幾多？";
  if (/關於我們|about us|our story/i.test(h)) return questions.about;
  if (/^(服務|產品|services|products)$/i.test(h)) return questions.services;
  return `關於「${h.slice(0, 82)}」，有咩需要了解？`;
}

// Questions are presentation labels; every answer is extracted from the source.
// No model, web instructions or guessed business facts participate in publication.
export function extractStructuredFaqs($: CheerioAPI): WebsiteFaq[] {
  const faqs: WebsiteFaq[] = [];
  const add = (question: string, answer: string) => {
    const q = cleanWebsiteText(question),
      a = cleanWebsiteText(answer);
    if (
      q &&
      q.length <= 100 &&
      a.length >= 1 &&
      a.length <= 5000 &&
      !faqs.some((f) => f.question === q && f.answer === a)
    )
      faqs.push({ question: q, answer: a });
  };
  $("script[type='application/ld+json']")
    .slice(0, 8)
    .each((_, el) => {
      const raw = $(el).text();
      if (raw.length > 50000) return;
      try {
        const data = JSON.parse(raw);
        const roots = Array.isArray(data) ? data : [data];
        const nodes = roots.flatMap((o) =>
          o && typeof o === "object"
            ? [
                o,
                ...(Array.isArray(o["@graph"]) ? o["@graph"].slice(0, 20) : []),
              ]
            : [],
        );
        for (const node of nodes) {
          if (![node["@type"]].flat().includes("FAQPage")) continue;
          for (const q of (Array.isArray(node.mainEntity)
            ? node.mainEntity
            : []
          ).slice(0, 24)) {
            const answer = q?.acceptedAnswer;
            if (
              typeof q?.name === "string" &&
              typeof answer?.text === "string"
            ) {
              const fragment = load(answer.text);
              fragment("script,style,iframe").remove();
              fragment("p,li,br").append("\n");
              add(q.name, fragment.text());
            }
          }
        }
      } catch {
        /* Readable HTML remains usable when metadata is malformed. */
      }
    });
  return faqs.slice(0, 24);
}

export function extractHeadingFaqs($: CheerioAPI): WebsiteFaq[] {
  const root = $("main").first().length ? $("main").first() : $("body");
  const faqs: WebsiteFaq[] = [];
  let heading = "",
    blocks: string[] = [];
  const flush = () => {
    const answer = cleanWebsiteText([...new Set(blocks)].join("\n\n"));
    if (heading && answer.length >= (/[?？]$/.test(heading) ? 1 : 12)) {
      const chunks = splitFaqAnswer(answer);
      chunks.forEach((a, i) =>
        faqs.push({
          question:
            headingQuestion(heading).slice(0, chunks.length > 1 ? 90 : 100) +
            (chunks.length > 1 ? `（${i + 1}）` : ""),
          answer: a,
        }),
      );
    }
    blocks = [];
  };
  root.find("h1,h2,h3,h4,summary,dt,p,li,dd,address").each((_, el) => {
    const node = $(el),
      tag = el.tagName;
    // A list item's own paragraphs are handled separately to avoid duplicate text.
    if ((tag === "li" || tag === "dd") && node.find("p,li,dd").length) return;
    const text = cleanWebsiteText(node.text());
    if (/^h[1-4]$/.test(tag) || tag === "summary" || tag === "dt") {
      flush();
      heading = text.length <= 100 ? text : "";
    } else if (
      text &&
      !node.parents("nav,header,footer,form,[hidden],[aria-hidden='true']")
        .length
    )
      blocks.push(text);
  });
  flush();
  return faqs.slice(0, 24);
}

export function splitFaqAnswer(text: string) {
  let remaining = cleanWebsiteText(text);
  const chunks: string[] = [];
  while (remaining && chunks.length < 3) {
    let end = Math.min(5000, remaining.length);
    if (end < remaining.length) {
      const boundary = remaining.lastIndexOf("\n", end);
      if (boundary > 2500) end = boundary;
    }
    chunks.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }
  return chunks;
}

export function pageFaqs(page: WebsitePage): WebsiteFaq[] {
  const primaryQuestion =
    page.category === "policy"
      ? /privacy|私隱|隱私/i.test(`${page.url} ${page.title}`)
        ? "你哋點樣處理個人資料？"
        : /terms|條款|使用說明/i.test(`${page.url} ${page.title}`)
          ? "使用服務前有咩條款要留意？"
          : questions.policy
      : questions[page.category];
  const faqs: WebsiteFaq[] = page.faqs.map((faq) => ({
    ...faq,
    question:
      faq.question === headingQuestion(page.title) &&
      faq.question.startsWith("關於「")
        ? primaryQuestion
        : faq.question,
  }));
  const add = (question: string, answer: string) => {
    if (
      answer &&
      !faqs.some((f) => f.question === question || f.answer === answer)
    )
      faqs.push({ question, answer });
  };
  if (
    page.description &&
    !faqs.some((f) => f.answer.includes(page.description))
  )
    faqs.unshift({
      question: primaryQuestion,
      answer: page.description,
    });
  add("點樣聯絡你哋？", [...page.phones, ...page.emails].join("\n"));
  add("你哋嘅地址喺邊？", page.addresses.join("\n"));
  add("營業時間係幾點？", page.hours.join("\n"));
  if (!page.faqs.length)
    splitFaqAnswer(page.text).forEach((answer, i, chunks) =>
      faqs.push({
        question: primaryQuestion + (chunks.length > 1 ? `（${i + 1}）` : ""),
        answer,
      }),
    );
  const grouped = new Map<string, string[]>();
  for (const faq of faqs) {
    let answers = grouped.get(faq.question) ?? [];
    answers = answers.filter(
      (a) => a === faq.answer || !faq.answer.includes(a),
    );
    if (!answers.some((a) => a.includes(faq.answer))) answers.push(faq.answer);
    grouped.set(faq.question, answers);
  }
  return [...grouped]
    .flatMap(([question, answers]) => {
      const chunks = splitFaqAnswer(answers.join("\n\n"));
      return chunks.map((answer, i) => ({
        question:
          question.slice(0, chunks.length > 1 ? 90 : 100) +
          (chunks.length > 1 ? `（${i + 1}）` : ""),
        answer,
      }));
    })
    .slice(0, 24);
}
