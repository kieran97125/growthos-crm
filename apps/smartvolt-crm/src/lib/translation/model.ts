import { z } from "zod";

export const targets = { "zh-Hant": "繁中", en: "English" } as const;
export type TranslationTarget = keyof typeof targets;
export type TranslationScope = {
  companyId: string;
  brandId: string;
  source: "conversation" | "whatsapp" | "meta" | "playground";
  threadId: string;
};
const id = z.string().min(1).max(100);
const context = {
  companyId: z.uuid(),
  requestId: z.uuid(),
  brandId: id,
  source: z.enum(["conversation", "whatsapp", "meta", "playground"]),
  threadId: id,
  target: z.enum(["zh-Hant", "en"]),
};
export const translationRequest = z
  .discriminatedUnion("mode", [
    z
      .object({ ...context, mode: z.literal("message"), messageId: id })
      .strict(),
    z
      .object({
        ...context,
        mode: z.literal("draft"),
        text: z
          .string()
          .min(1)
          .max(6000)
          .refine((v) => v.trim().length > 0 && v.isWellFormed()),
      })
      .strict(),
  ])
  .superRefine((v, ctx) => {
    if (
      v.source === "playground" &&
      (v.mode !== "draft" || v.threadId !== "studio")
    )
      ctx.addIssue({
        code: "custom",
        message: "Studio only accepts staff drafts",
      });
    if (
      v.source !== "conversation" &&
      v.source !== "playground" &&
      (!z.uuid().safeParse(v.threadId).success ||
        (v.mode === "message" && !z.uuid().safeParse(v.messageId).success))
    )
      ctx.addIssue({
        code: "custom",
        message: "Invalid provider message context",
      });
  });
export type TranslationRequest = z.infer<typeof translationRequest>;
export const translationResult = z.object({
  requestId: z.uuid(),
  target: z.enum(["zh-Hant", "en"]),
  text: z.string().min(1).max(12000),
});
export type TranslationResult = z.infer<typeof translationResult>;

/** Script detection is local and advisory. Names, addresses and links aren't
 * evidence that an otherwise Chinese sentence is written in English. */
export function detectLanguage(
  text: string,
): "zh" | "en" | "mixed" | "unknown" {
  const prose = text.replace(
    /https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,
    "",
  );
  const han = prose.match(/\p{Script=Han}/gu)?.length ?? 0;
  const words = prose.match(/[a-z]+(?:['’-][a-z]+)*/gi) ?? [];
  const latin = words.join("").length;
  // Kana/Hangul/Cyrillic etc. must not be presented as Chinese or English.
  const other = prose.replace(
    /\p{Script=Han}|[a-z\p{M}\p{N}\p{P}\p{S}\s]/giu,
    "",
  );
  if (other) return "unknown";
  if (han && words.length >= 3 && latin >= 10) return "mixed";
  if (han) return "zh";
  if (latin >= 2) return "en";
  return "unknown";
}

export const languageLabels = {
  zh: "中文",
  en: "English",
  mixed: "中英夾雜",
  unknown: "翻譯",
};

export function protectTranslationText(text: string, nonce: string) {
  if (!/^[a-f0-9]{12}$/.test(nonce)) throw Error("Invalid translation nonce");
  const values: string[] = [];
  const prefix = `⟪CV_${nonce}_`;
  const masked = text.replace(
    /https?:\/\/[^\s<>，。！？；、（）「」『』]+|www\.[^\s<>，。！？；、（）「」『』]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:HK\$|US\$|HKD\s?|USD\s?|[$€£])?\+?\d[\d.,:/%+()-]*(?:[ \u00a0]\d[\d.,:/%+()-]*)*/gi,
    (value) => {
      values.push(value);
      return `${prefix}${values.length - 1}⟫`;
    },
  );
  return { masked, values, prefix };
}
export function restoreTranslationText(
  raw: string,
  protectedText: ReturnType<typeof protectTranslationText>,
) {
  let text = raw.trim();
  if (!text || !text.isWellFormed() || text.length > 12000)
    throw Error("translation_verification_failed");
  for (let i = 0; i < protectedText.values.length; i++) {
    const token = `${protectedText.prefix}${i}⟫`;
    if (text.split(token).length !== 2)
      throw Error("translation_verification_failed");
  }
  const unmasked = protectedText.values.reduce(
    (value, _, i) => value.replace(`${protectedText.prefix}${i}⟫`, ""),
    text,
  );
  if (
    unmasked.includes(protectedText.prefix) ||
    /\d|https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(unmasked)
  )
    throw Error("translation_verification_failed");
  for (let i = 0; i < protectedText.values.length; i++)
    text = text.replace(
      `${protectedText.prefix}${i}⟫`,
      () => protectedText.values[i],
    );
  if (text.length > 12000) throw Error("translation_verification_failed");
  return text;
}
