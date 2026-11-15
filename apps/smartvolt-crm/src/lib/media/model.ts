import { z } from "zod";

export const MEDIA_MAX_BYTES = 25 * 1024 * 1024;
export const MEDIA_BUCKET = "convelta-attachments";
export const MEDIA_KINDS = ["image", "video", "audio", "document"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];
export const MEDIA_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/aac",
  "audio/flac",
  "audio/webm",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;
export const mediaScope = z.object({
  brandId: z.string().min(1).max(100),
  source: z.enum(["whatsapp", "meta"]),
  sourceId: z.uuid(),
});
export type MediaScope = z.infer<typeof mediaScope>;
export const mediaQuery = mediaScope
  .extend({ messageId: z.uuid().optional() })
  .strict();
const assetCommand = mediaScope.extend({ assetId: z.uuid() });
export const mediaCommand = z.discriminatedUnion("action", [
  mediaScope
    .extend({
      action: z.literal("reserve"),
      requestId: z.uuid(),
      filename: z.string().trim().min(1).max(200),
      bytes: z.number().int().min(1).max(MEDIA_MAX_BYTES),
      mimeType: z.enum(MEDIA_MIME_TYPES),
    })
    .strict(),
  assetCommand.extend({ action: z.literal("complete") }).strict(),
  assetCommand.extend({ action: z.literal("cancel") }).strict(),
  assetCommand.extend({ action: z.literal("open") }).strict(),
  mediaScope
    .extend({
      action: z.literal("prepare"),
      messageId: z.uuid(),
      index: z.number().int().min(0).max(9),
    })
    .strict(),
  assetCommand
    .extend({
      action: z.literal("send"),
      clientId: z.uuid(),
      revision: z.number().int().nonnegative(),
      editorToken: z.uuid(),
      caption: z
        .string()
        .trim()
        .max(1000)
        .refine((v) => v.isWellFormed() && !v.includes("\u0000"))
        .default(""),
    })
    .strict(),
  mediaScope
    .extend({ action: z.literal("receipt"), clientId: z.uuid() })
    .strict(),
]);
export type MediaCommand = z.infer<typeof mediaCommand>;
export type MediaItem = {
  id: string;
  assetId: string | null;
  messageId: string;
  index: number;
  kind: MediaKind;
  filename: string;
  mimeType: string | null;
  bytes: number | null;
  available: boolean;
};
export type MediaPage = { items: MediaItem[] };
export type MediaAsset = {
  id: string;
  kind: MediaKind;
  filename: string;
  mimeType: string;
  bytes: number;
  state: "ready";
};
export type MediaReceipt = {
  clientId: string;
  messageId: string;
  state:
    | "sending"
    | "accepted"
    | "sent"
    | "delivered"
    | "read"
    | "failed"
    | "unknown";
  replayed: boolean;
  errorCode: string | null;
};
export const kindNames: Record<MediaKind, string> = {
  image: "圖片",
  video: "影片",
  audio: "語音",
  document: "文件",
};
export function safeFilename(value: string) {
  const base = value
    .replace(/[\\/\u0000-\u001f\u007f]/g, "_")
    .replace(/[\u202a-\u202e\u2066-\u2069]/g, "")
    .trim();
  return Array.from(base || "附件")
    .slice(0, 180)
    .join("");
}
export function mediaLimit(kind: MediaKind) {
  return kind === "image"
    ? 5 * 1024 * 1024
    : kind === "audio" || kind === "video"
      ? 16 * 1024 * 1024
      : MEDIA_MAX_BYTES;
}
export function supportedMedia(
  kind: MediaKind,
  mime: string,
  source: MediaScope["source"],
  channel?: string,
) {
  if (source === "whatsapp") {
    if (kind === "image") return ["image/jpeg", "image/png"].includes(mime);
    if (kind === "video") return mime === "video/mp4";
    if (kind === "audio")
      return ["audio/mpeg", "audio/mp4", "audio/ogg", "audio/aac"].includes(
        mime,
      );
    return (
      mime === "application/pdf" ||
      mime.startsWith("application/vnd.openxmlformats-officedocument.")
    );
  }
  if (channel === "instagram" && kind === "document")
    return mime === "application/pdf";
  return (
    kind !== "image" ||
    ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mime)
  );
}
