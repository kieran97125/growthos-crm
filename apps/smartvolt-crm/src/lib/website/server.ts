import "server-only";
import { z } from "zod";
import { loadCompany } from "@/lib/saas/server";
import { AccessError, canManage } from "@/lib/saas/identity";
import { projectWorkspace } from "@/lib/saas/products";
import { appSchema } from "@/lib/demo/state";
import { initialWebsiteState, stepWebsiteState } from "./crawl";
import { WebsiteError } from "./transport";
import {
  websiteActionSchema,
  websiteImportSchema,
  websiteJobSchema,
  websiteStateSchema,
} from "./model";

function fail(error: { message: string } | null) {
  if (!error) return;
  const code = error.message;
  const message = code.includes("revision_conflict")
    ? "其他同事已更新知識庫，請重新載入後再匯入。"
    : code.includes("scan_limit")
      ? "掃描次數已達本時段上限，請稍後再試。"
      : code.includes("active_scan")
        ? "此品牌有另一個網站掃描未完成，請先繼續該次掃描。"
        : code.includes("knowledge_limit")
          ? "品牌知識庫已達 100 條上限，暫時未能加入更多 FAQ。"
          : code.includes("expired")
            ? "此掃描已超過一天，請重新掃描網站。"
            : code.includes("lease_lost")
              ? "掃描連線已交由另一個工作頁接續，請重新載入進度。"
              : "暫時未能完成網站匯入，請重新讀取進度再試。";
  throw new AccessError(
    message,
    /access_denied|product_required|brand_scope/.test(code) ? 403 : 409,
  );
}
async function access(companyId: string) {
  const a = await loadCompany(companyId, "crm");
  if (!canManage(a.actor.role))
    throw new AccessError("網站匯入需要公司管理員權限。");
  return a;
}
type Access = Awaited<ReturnType<typeof access>>;
async function job(a: Access, id: string) {
  const r = await a.db
    .from("sv_website_imports")
    .select(
      "id,brand_id,status,state,created_at,updated_at,added,skipped,refreshed",
    )
    .eq("company_id", a.company.id)
    .eq("id", id)
    .single();
  if (r.error || !r.data)
    throw new AccessError("找不到此品牌嘅網站掃描。", 404);
  if (!a.scope.brands.some((b) => b.id === r.data.brand_id))
    throw new AccessError("品牌不屬於此公司。");
  return websiteJobSchema.parse({
    id: r.data.id,
    brandId: r.data.brand_id,
    status: r.data.status,
    state: r.data.state,
    createdAt: r.data.created_at,
    updatedAt: r.data.updated_at,
    added: r.data.added,
    skipped: r.data.skipped,
    refreshed: r.data.refreshed,
  });
}
export async function readWebsiteImport(companyId: string, brand: string) {
  const a = await access(companyId);
  z.string().min(1).max(100).parse(brand);
  if (!a.scope.brands.some((b) => b.id === brand))
    throw new AccessError("品牌不屬於此公司。");
  const r = await a.db
    .from("sv_website_imports")
    .select("id")
    .eq("company_id", companyId)
    .eq("brand_id", brand)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (r.error) throw new AccessError("暫時未能讀取掃描進度。", 503);
  return { job: r.data ? await job(a, r.data.id) : null };
}
export async function actWebsiteImport(companyId: string, raw: unknown) {
  const a = await access(companyId),
    input = websiteActionSchema.parse(raw);
  if (input.kind === "start") {
    let state;
    try {
      state = initialWebsiteState(input.url);
    } catch (e) {
      throw new AccessError(
        e instanceof WebsiteError ? e.message : "網址格式不正確。",
        400,
      );
    }
    const r = await a.db.rpc("sv_website_start", {
      p_company: companyId,
      p_actor: a.user.id,
      p_id: input.id,
      p_brand: input.brandId,
      p_state: state,
    });
    fail(r.error);
    return { job: await job(a, r.data) };
  }
  const current = await job(a, input.id);
  if (!["queued", "running"].includes(current.status)) return { job: current };
  const claim = await a.db.rpc("sv_website_claim", {
    p_company: companyId,
    p_actor: a.user.id,
    p_id: input.id,
    p_token: input.token,
  });
  fail(claim.error);
  if (!claim.data) return { job: await job(a, input.id) };
  const result = await stepWebsiteState(
    websiteStateSchema.parse(claim.data.state),
    companyId,
    claim.data.brandId,
    current.id,
  );
  const finished = await a.db.rpc("sv_website_finish", {
    p_company: companyId,
    p_actor: a.user.id,
    p_id: input.id,
    p_token: input.token,
    p_state: result.state,
    p_status: result.status,
  });
  fail(finished.error);
  return { job: await job(a, input.id) };
}
export async function commitWebsiteImport(companyId: string, raw: unknown) {
  const a = await access(companyId),
    input = websiteImportSchema.parse(raw);
  const r = await a.db.rpc("sv_website_import", {
    p_company: companyId,
    p_actor: a.user.id,
    p_id: input.id,
    p_command: input.commandId,
    p_expected: input.revision,
    p_selected: input.selected,
  });
  fail(r.error);
  const state = appSchema.parse(r.data.state);
  return {
    state: projectWorkspace(state, a.products),
    revision: r.data.revision,
    added: r.data.added,
    skipped: r.data.skipped,
    refreshed: r.data.refreshed,
  };
}
