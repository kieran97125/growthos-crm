import { z } from "zod";

export {
  VOICE_MAX_BYTES,
  VOICE_MAX_SECONDS,
  VOICE_MIME_TYPES,
} from "./constants";
export const voiceSource = z.enum(["conversation", "whatsapp", "meta"]);
export type VoiceSource = z.infer<typeof voiceSource>;
export const voiceQuery = z
  .object({
    brandId: z.string().min(1).max(100),
    source: voiceSource,
    sourceId: z.string().min(1).max(100),
    messageId: z.uuid().optional(),
  })
  .strict();
export const voiceCommand = z.discriminatedUnion("type", [
  voiceQuery.extend({
    type: z.literal("transcribe"),
    requestId: z.uuid(),
    messageId: z.uuid(),
  }),
  z
    .object({
      type: z.literal("correct"),
      commandId: z.uuid(),
      transcriptId: z.uuid(),
      expectedRevision: z.number().int().nonnegative(),
      text: z.string().trim().min(1).max(12000),
      reason: z.string().trim().min(1).max(500),
    })
    .strict(),
]);
export type VoiceExtraction = {
  kind: "need" | "date";
  text: string;
  quote: string;
};
export type VoiceTranscript = {
  id: string;
  originalText: string;
  text: string;
  language: "cantonese" | "english" | "mixed" | "other";
  revision: number;
  extractions: VoiceExtraction[];
  corrected: boolean;
  createdAt: string;
  history: {
    revision: number;
    text: string;
    reason: string;
    createdAt: string;
  }[];
};
export type VoiceItem = {
  id: string;
  messageId: string;
  requestId?: string;
  available: boolean;
  status: "available" | "missing_audio" | "running" | "completed" | "failed";
  origin: "provider" | "staff_upload";
  audioUrl: string | null;
  transcript: VoiceTranscript | null;
  durationSeconds?: number;
  mimeType?: string;
  createdAt?: string;
  label?: string;
};
export type VoicePage = {
  items: VoiceItem[];
  canTranscribe: boolean;
  canCorrect: boolean;
  readiness: "configured" | "disabled" | "unconfigured";
  blocker: string | null;
};

/** Literal excerpts only. These are customer requests, never confirmed booking facts. */
export function extractVoiceNeeds(text: string): VoiceExtraction[] {
  const parts = text
    .split(/[。！？!?\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const dates =
    /(?:今[日天晚]|聽[日朝晚]|明[天日晚]|後[天日]|(?:下|今|這|本)個?星[期周][一二三四五六日天]?|星[期周][一二三四五六日天]|\d{1,4}[-\/]\d{1,2}(?:[-\/]\d{1,2})?|\d{1,2}月\d{1,2}[日號]?|\d{1,2}(?::\d{2}|點|時)|\b(?:today|tomorrow|tonight|next\s+week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\s*(?:am|pm))\b)/iu;
  const need =
    /(?:想|需要|希望|可以|預約|预约|預訂|预订|改期|取消|查詢|查询|了解|收費|收费|價錢|价钱|價格|价格|服務|服务|\b(?:want|need|book|appointment|reschedule|cancel|price|cost|service|prefer)\b|\b(?:how\s+much|(?:can|could|may)\s+I|(?:can|could)\s+you|(?:is|are)\s+there|do\s+you\s+(?:have|offer)|I\s+(?:would\s+like|am\s+looking\s+for)|I['’](?:d\s+like|m\s+looking\s+for))\b)/iu;
  const found: VoiceExtraction[] = [];
  for (const part of parts) {
    const quote = part.slice(0, 300);
    if (dates.test(part)) found.push({ kind: "date", text: quote, quote });
    if (need.test(part)) found.push({ kind: "need", text: quote, quote });
    if (found.length >= 8) break;
  }
  return found.slice(0, 8);
}
export function voiceLanguage(
  provider: string | undefined,
  text: string,
): VoiceTranscript["language"] {
  const han = /\p{Script=Han}/u.test(text),
    latin = /[A-Za-z]{3}/.test(text);
  if (han && latin) return "mixed";
  if (provider === "yue" || /嘅|喺|咩|唔|嚟|冇|佢|係/u.test(text))
    return "cantonese";
  if (
    provider &&
    !["en", "yue", "zh", "zho", "zh-HK", "zh-CN", "zh-TW"].includes(provider)
  )
    return "other";
  if (provider === "en" || (!han && latin)) return "english";
  return "other";
}
