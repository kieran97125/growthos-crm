import { z } from "zod";
import { articleSchema } from "@/components/crm/studio/model";

export const WEBSITE_LIMITS = {
  pages: 8,
  text: 12000,
  links: 60,
  htmlBytes: 1000000,
  robotsBytes: 32000,
  faqs: 60,
} as const;
export const websiteFaqSchema = z.object({
  question: z.string().min(1).max(100),
  answer: z.string().min(1).max(5000),
});
export const websitePageSchema = z.object({
  id: z.string().max(64),
  url: z.url().max(2048),
  title: z.string().min(1).max(100),
  category: z.enum([
    "overview",
    "about",
    "services",
    "contact",
    "faq",
    "policy",
  ]),
  description: z.string().max(500),
  text: z.string().max(WEBSITE_LIMITS.text),
  fetchedAt: z.iso.datetime(),
  truncated: z.boolean(),
  phones: z.array(z.string().max(80)).max(8),
  emails: z.array(z.string().max(160)).max(8),
  addresses: z.array(z.string().max(300)).max(8),
  hours: z.array(z.string().max(300)).max(8),
  faqs: z.array(websiteFaqSchema).max(24).default([]),
});
export const websiteStateSchema = z.object({
  version: z.literal(1),
  format: z.enum(["pages", "faq"]).default("pages"),
  derivedFrom: z.uuid().optional(),
  inputUrl: z.url().max(2048),
  queue: z.array(z.url().max(2048)).max(WEBSITE_LIMITS.links),
  visited: z.array(z.string().max(2048)).max(WEBSITE_LIMITS.links),
  pages: z.array(websitePageSchema).max(WEBSITE_LIMITS.pages),
  robots: z
    .array(
      z.object({
        origin: z.url().max(2048),
        text: z.string().max(WEBSITE_LIMITS.robotsBytes),
      }),
    )
    .max(2),
  warnings: z
    .array(z.object({ url: z.string().max(2048), reason: z.string().max(160) }))
    .max(WEBSITE_LIMITS.links),
  candidates: z.array(articleSchema).max(WEBSITE_LIMITS.faqs),
});
export const websiteJobSchema = z.object({
  id: z.uuid(),
  brandId: z.string().min(1).max(100),
  status: z.enum(["queued", "running", "ready", "imported", "failed"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  state: websiteStateSchema,
  added: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  refreshed: z.number().int().nonnegative().default(0),
});
export const websiteActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("start"),
    id: z.uuid(),
    brandId: z.string().min(1).max(100),
    url: z.string().min(1).max(2048),
  }),
  z.object({ kind: z.literal("step"), id: z.uuid(), token: z.uuid() }),
]);
export const websiteImportSchema = z
  .object({
    id: z.uuid(),
    commandId: z.uuid(),
    revision: z.number().int().nonnegative(),
    selected: z
      .array(z.string().min(1).max(100))
      .min(1)
      .max(WEBSITE_LIMITS.faqs),
  })
  .refine(
    (v) => new Set(v.selected).size === v.selected.length,
    "重複知識項目。",
  );
export type WebsiteState = z.infer<typeof websiteStateSchema>;
export type WebsitePage = z.infer<typeof websitePageSchema>;
export type WebsiteJob = z.infer<typeof websiteJobSchema>;
export type WebsiteImportSelection = { id: string; selected: string[] };
export type WebsiteImportResult = {
  added: number;
  skipped: number;
  refreshed: number;
};
export const categoryLabels: Record<WebsitePage["category"], string> = {
  overview: "品牌概覽",
  about: "品牌介紹",
  services: "服務與產品",
  contact: "聯絡與分店",
  faq: "常見問題",
  policy: "條款與政策",
};
