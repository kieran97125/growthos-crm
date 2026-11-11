import type { NextRequest } from "next/server";
import { loadCompany } from "@/lib/saas/server";
import { applyCompanyCommand, mutationSchema } from "@/lib/saas/workspace";
import { failure, json, sameOrigin } from "@/lib/saas/http";
import { AccessError } from "@/lib/saas/identity";
type Context = { params: Promise<{ companyId: string }> };
export async function GET(_request: NextRequest, context: Context) {
  try {
    const { companyId } = await context.params;
    const { state, revision } = await loadCompany(companyId);
    return json({ state, revision });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    sameOrigin(request);
    const { companyId } = await context.params;
    const current = await loadCompany(companyId);
    const raw = await request.text();
    if (raw.length > 150000) throw new AccessError("改動資料太大。", 413);
    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      throw new AccessError("資料格式不正確。", 400);
    }
    const command = mutationSchema.parse(input);
    // The database also validates membership and active subscription under the write lock.
    const next = applyCompanyCommand(
      current.state,
      command.command,
      current.actor,
    );
    const { data, error } = await current.db.rpc("sv_commit_workspace", {
      p_company: companyId,
      p_actor: current.user.id,
      p_expected: command.revision,
      p_command_id: command.commandId,
      p_payload: next,
      p_kind: command.command.type,
    });
    if (error?.message.includes("revision_conflict"))
      return json(
        { error: "其他同事已更新資料，請重新載入再修改。", conflict: true },
        409,
      );
    if (error)
      throw new AccessError("權限已變更或未能儲存改動，請重新載入。", 409);
    return json(data);
  } catch (error) {
    return failure(error);
  }
}
