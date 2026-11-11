"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCompany } from "@/lib/saas/server";
export async function updateMember(
  _state: { error: string; success: string },
  form: FormData,
) {
  const parsed = z
    .object({
      companyId: z.uuid(),
      target: z.uuid(),
      commandId: z.uuid(),
      revision: z.coerce.number().int().nonnegative(),
      role: z.enum(["manager", "agent", "viewer"]),
      status: z.enum(["active", "suspended", "removed"]),
      name: z.string().trim().min(1).max(80),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { error: "資料不完整，請重新載入再試。", success: "" };
  try {
    const p = parsed.data,
      access = await requireCompany(p.companyId);
    if (access.actor.role !== "owner")
      return { error: "只有公司擁有人可以修改員工權限。", success: "" };
    const { error } = await access.db.rpc("sv_update_member", {
      p_company: p.companyId,
      p_actor: access.user.id,
      p_target: p.target,
      p_expected: p.revision,
      p_command_id: p.commandId,
      p_role: p.role,
      p_status: p.status,
      p_name: p.name,
    });
    if (error)
      return {
        error: error.message.includes("revision_conflict")
          ? "資料已更新，請重新載入再確認改動。"
          : error.message.includes("member_reassignment_required")
            ? "此同事仍有對話或流程版本指派，請先聯絡管理員處理交接；未有更改存取權。"
            : error.message.includes("seat_limit")
              ? "已達公司席位上限。"
              : error.message.includes("owner_protected")
                ? "擁有人帳戶受保護。"
                : "未能更新員工權限；改動未有儲存。",
        success: "",
      };
    revalidatePath(`/company/${p.companyId}/settings`);
    return { error: "", success: "已更新。新權限會喺下一次伺服器操作生效。" };
  } catch {
    return { error: "服務暫時未能完成操作，請重新登入再試。", success: "" };
  }
}
