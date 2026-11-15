import "server-only";
import { z } from "zod";
import { requireCompany } from "@/lib/saas/server";
import { requireProduct } from "@/lib/saas/products";
import { AccessError } from "@/lib/saas/identity";
import { editorAction, type EditorState } from "./editor";
export async function actEditor(
  company: string,
  raw: unknown,
): Promise<EditorState> {
  z.uuid().parse(company);
  const a = await requireCompany(company);
  requireProduct(a.products, "crm");
  const input = editorAction.parse(raw);
  const r = await a.db.rpc("sv_editor_action", {
    p_company: company,
    p_actor: a.user.id,
    p_provider: input.provider,
    p_thread: input.threadId,
    p_token: input.token,
    p_mode: input.mode,
    p_expected: input.revision ?? null,
  });
  if (r.error) {
    if (/editor_conflict/.test(r.error.message))
      throw new AccessError(
        "另一位同事已接手，請重新核對回覆狀態。草稿會保留。",
        409,
      );
    if (/access_denied|product_required|brand_scope/.test(r.error.message))
      throw new AccessError("你無權回覆呢段對話。", 403);
    throw new AccessError("暫時未能核對回覆狀態，草稿會保留。", 503);
  }
  return r.data;
}
