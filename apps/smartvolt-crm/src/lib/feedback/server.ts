import "server-only";
import { z } from "zod";
import { createHash } from "node:crypto";
import { requireCompany } from "@/lib/saas/server";
import { requireProduct } from "@/lib/saas/products";
import { AccessError } from "@/lib/saas/identity";
import { engagementFailure } from "@/lib/engagement/server";
import {
  encryptCredentials,
  decryptCredentials,
  readMasterKey,
} from "@/lib/whatsapp/crypto";
import { feedbackAction, type FeedbackPage } from "./model";
import { verifyDestination } from "./graph";
async function access(company: string) {
  z.uuid().parse(company);
  const a = await requireCompany(company);
  requireProduct(a.products, "crm");
  return a;
}
export async function readFeedback(
  company: string,
  raw: unknown,
): Promise<FeedbackPage> {
  const a = await access(company),
    q = z
      .object({
        brand: z.string().min(1).max(100).optional(),
        customer: z.string().min(1).max(100).optional(),
        before: z.iso.datetime({ offset: true }).optional(),
        id: z.uuid().optional(),
      })
      .strict()
      .refine((x) => !!x.before === !!x.id)
      .parse(raw),
    r = await a.db.rpc("sv_feedback_read", {
      p_company: company,
      p_actor: a.user.id,
      p_brand: q.brand ?? null,
      p_customer: q.customer ?? null,
      p_before: q.before ?? null,
      p_id: q.id ?? null,
    });
  engagementFailure(r.error);
  const d = r.data as FeedbackPage,
    jobs = d.jobs.slice(0, 30),
    last = jobs.at(-1);
  return {
    ...d,
    jobs,
    next:
      d.jobs.length > 30 && last
        ? new URLSearchParams({
            before: last.created_at,
            id: last.id,
          }).toString()
        : null,
    canConfigure: a.actor.role === "owner",
    brands: d.brands,
  };
}
export async function actFeedback(company: string, raw: unknown) {
  const a = await access(company),
    c = feedbackAction.parse(raw),
    { commandId, action, ...data } = c;
  if (action === "consent") {
    const r = await a.db.rpc("sv_feedback_action", {
      p_company: company,
      p_actor: a.user.id,
      p_command: commandId,
      p_kind: action,
      p_data: data,
    });
    engagementFailure(r.error);
    return r.data;
  }
  if (c.action !== "setting") throw new AccessError("設定無效。", 400);
  if (a.actor.role !== "owner")
    throw new AccessError("請由公司擁有人連接 Meta 成效回傳。", 403);
  const { token, authorized: _, ...request } = c;
  void _;
  const original = {
      ...request,
      tokenHash: token
        ? createHash("sha256").update(token).digest("hex")
        : "reuse",
    },
    replay = await a.db.rpc("sv_feedback_receipt", {
      p_company: company,
      p_actor: a.user.id,
      p_command: commandId,
      p_request: original,
    });
  engagementFailure(replay.error);
  if (replay.data) return replay.data;
  let actualToken = token;
  if (!actualToken) {
    const prior = await a.db
      .from("sv_feedback_settings")
      .select("encrypted_credentials")
      .eq("company_id", company)
      .eq("brand_id", c.brandId)
      .single();
    if (prior.error) throw new AccessError("請填寫 Meta 成效回傳 Token。", 400);
    actualToken = decryptCredentials(
      prior.data.encrypted_credentials,
      readMasterKey(),
      company,
      "feedback:" + c.brandId,
    ).token as string;
  }
  let verified;
  try {
    verified = await verifyDestination({ ...c, token: actualToken! });
  } catch {
    throw new AccessError(
      "未能核實數據集、商業管理平台及廣告帳戶嘅擁有權或存取權，請核對 Meta 設定。",
      409,
    );
  }
  const credentials = encryptCredentials(
      { token: actualToken },
      readMasterKey(),
      company,
      "feedback:" + c.brandId,
    ),
    r = await a.db.rpc("sv_feedback_action", {
      p_company: company,
      p_actor: a.user.id,
      p_command: commandId,
      p_kind: "setting",
      p_data: { ...request, label: verified.label, credentials },
      p_request: original,
    });
  engagementFailure(r.error);
  return r.data;
}
