import { managerCommands } from "@/lib/pos/model";
import type { NextRequest } from "next/server";
import { projectWorkspace, productSchema } from "@/lib/saas/products";
import { loadCompany, loadCompanyForCommand } from "@/lib/saas/server";
import { applyCompanyCommand, mutationSchema } from "@/lib/saas/workspace";
import { failure, json, sameOrigin } from "@/lib/saas/http";
import { AccessError } from "@/lib/saas/identity";
type Context = { params: Promise<{ companyId: string }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    const { companyId } = await context.params;
    const requested = request.nextUrl.searchParams.get("product");
    const product =
      requested === null ? undefined : productSchema.parse(requested);
    const { state, revision, products } = await loadCompany(companyId, product);
    return json({ state, revision, products });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    sameOrigin(request);
    const { companyId } = await context.params;
    const raw = await request.text();
    if (raw.length > 150000) throw new AccessError("改動資料太大。", 413);
    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      throw new AccessError("資料格式不正確。", 400);
    }
    const command = mutationSchema.parse(input);
    const current = await loadCompanyForCommand(companyId, command.command);
    // The database also validates membership and active subscription under the write lock.
    const next = applyCompanyCommand(
      current.state,
      command.command,
      current.actor,
      Date.now(),
      current.products,
    );
    const { data, error } = await current.db.rpc("sv_commit_workspace", {
      p_company: companyId,
      p_actor: current.user.id,
      p_expected: command.revision,
      p_command_id: command.commandId,
      p_payload: next,
      p_kind:
        command.command.type === "pos" &&
        managerCommands.has(command.command.command.kind)
          ? "pos-admin"
          : command.command.type,
    });
    if (error?.message.includes("revision_conflict"))
      return json(
        { error: "其他同事已更新資料，請重新載入再修改。", conflict: true },
        409,
      );
    if (error)
      throw new AccessError("權限已變更或未能儲存改動，請重新載入。", 409);
    return json({
      ...data,
      state: projectWorkspace(data.state, current.products),
      products: current.products,
    });
  } catch (error) {
    return failure(error);
  }
}
