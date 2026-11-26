import type { AssistantInput } from "@/lib/demo/ai-contract";

// Apply to visitor-controlled text only. Approved public merchant facts (such as
// a branch contact number or price) retain their original source and wording.
const medical =
  /醫生|医生|懷孕|怀孕|有[咗左]BB|有身孕|陀[緊住]?B|大肚|哺乳|餵奶|喂奶|發炎|发炎|病歷|病历|病史|敏感症|過敏|过敏|診斷|诊断|處方|处方|服藥|服药|食緊藥|藥物|药物|手術後|手术后|哮喘|出血|皮膚紅腫|皮肤红肿|皮膚病|皮肤病|濕疹|湿疹|糖尿病|癌症|\b(?:pregnan\w*|breastfeed\w*|allerg\w*|inflamm\w*|diagnos\w*|prescription|medications?|medical (?:records?|history|conditions?)|doctors?|eczema|diabet(?:es|ic)|asthma|cancer|medical advice|post.?surgery|side effects?)\b/iu;
const escalation = /退款|投訴|投诉|經理|经理|\b(?:refund\w*|complain\w*)\b/iu;
const privateRecord =
  /身份證|身分證|身份证|护照|護照|銀行戶口|銀行帳戶|銀行賬戶|银行账户|信用卡號|信用卡号|登入密碼|登录密码|一次性密碼|驗證碼|验证码|我的住址|我住喺|我住在|\b(?:hkid|passport|ssn|social security|bank account|credit card number|password|one[ -]time (?:password|code)|my (?:home )?address is)\b|(?<![A-Z0-9])[A-Z]{1,2}\s*\d{6}\s*\([\dA]\)(?![A-Z0-9])|(?<!\d)(?:\d[ -]?){13,18}\d(?!\d)/iu;

function normalize(text: string) {
  return text
    .normalize("NFKC")
    .replace(/[\u00ad\u200b-\u200f\u2060\ufeff]/gu, "");
}

export function websitePrivacyHandoff(text: string) {
  const value = normalize(text);
  return (
    medical.test(value) || escalation.test(value) || privateRecord.test(value)
  );
}

export class WebsitePrivacyHandoff extends Error {
  constructor() {
    super("website_privacy_handoff");
  }
}

function minimizeVisitorText(text: string, name: string) {
  let safe = normalize(text)
    .replace(/https?:\/\/[^\s<>,!?，。！？「」]+/giu, "[連結]")
    .replace(/[\w.!#$%&'*+/=?^_`{|}~-]+@[\w.-]+\.[a-z]{2,}/giu, "[電郵]")
    .replace(
      /(?<!\d)\d{4}-\d{1,2}-\d{1,2}(?!\d)|\+?\(?\d[\d ().-]{4,}\d/gu,
      (number) => {
        if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(number)) return number;
        return number.replace(/\D/g, "").length >= 7 ? "[聯絡號碼]" : number;
      },
    );
  // Redact the supplied display name and its independently repeated parts.
  for (const part of new Set([name, ...name.split(/\s+/u)])) {
    if (!part) continue;
    const literal = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = /^\p{Script=Latin}+$/u.test(part)
      ? `(?<!\\p{Script=Latin})${literal}(?!\\p{Script=Latin})`
      : literal;
    safe = safe.replace(new RegExp(pattern, "giu"), "[訪客]");
  }
  // An independently supplied identity cannot be verified against the form.
  if (
    /(?:我(?:個名係|叫)|my (?:full )?name is|call me)\s*(?:\p{L}|\d)/iu.test(
      safe,
    )
  )
    throw new WebsitePrivacyHandoff();
  return safe;
}

export function websiteModelInput(input: AssistantInput): AssistantInput {
  const name = normalize(input.name).trim();
  function prepare(text: string) {
    if (websitePrivacyHandoff(text)) throw new WebsitePrivacyHandoff();
    return minimizeVisitorText(text, name);
  }
  return {
    name: "訪客",
    message: prepare(input.message),
    history: input.history.map(({ role, content }) => ({
      role,
      content: prepare(content),
    })),
    brandId: input.brandId,
    profile: input.profile,
    articles: input.articles,
    withinWindow: input.withinWindow,
    humanOwned: input.humanOwned,
    businessHours: input.businessHours,
    assist: input.assist,
  };
}
