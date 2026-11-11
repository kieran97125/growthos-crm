import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { saasConfig } from "./config";
import { AccessError, roleSchema, scopeSchema, type Actor } from "./identity";
import { appSchema } from "@/lib/demo/state";

export async function authClient() {
  const config = saasConfig();
  if (!config) throw new AccessError("公司登入服務尚未啟用。", 503);
  const jar = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: {
      name: "smartvolt-auth",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
    cookies: {
      getAll: () => jar.getAll(),
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) =>
            jar.set(name, value, options),
          );
        } catch {
          /* Server components are refreshed by proxy. */
        }
      },
    },
  });
}
export function database() {
  const config = saasConfig();
  if (!config) throw new AccessError("公司資料服務尚未啟用。", 503);
  return createClient(config.url, config.secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function requireUser() {
  const client = await authClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user || user.is_anonymous)
    throw new AccessError("請先登入公司帳戶。", 401);
  return user;
}
export async function companiesForUser() {
  const user = await requireUser();
  const { data, error } = await database()
    .from("sv_memberships")
    .select(
      "company_id, role, display_name, sv_companies!inner(id,name,status)",
    )
    .eq("user_id", user.id)
    .eq("status", "active")
    .eq("sv_companies.status", "active");
  if (error) throw new AccessError("暫時未能讀取公司工作空間。", 503);
  return { user, memberships: data ?? [] };
}
export async function requireCompany(companyId: string) {
  const user = await requireUser();
  const db = database();
  const { data: member, error } = await db
    .from("sv_memberships")
    .select("role,display_name,sv_companies!inner(id,name,status)")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .eq("sv_companies.status", "active")
    .maybeSingle();
  if (error) throw new AccessError("暫時未能核實公司權限。", 503);
  if (!member) throw new AccessError("你無權進入此公司工作空間。");
  const company = Array.isArray(member.sv_companies)
    ? member.sv_companies[0]
    : member.sv_companies;
  const actor: Actor = {
    id: user.id,
    name: member.display_name,
    role: roleSchema.parse(member.role),
  };
  return {
    db,
    user,
    actor,
    company: company as { id: string; name: string; status: string },
  };
}
export async function loadCompany(companyId: string) {
  const access = await requireCompany(companyId);
  const { data, error } = await access.db
    .from("sv_workspaces")
    .select("revision,payload")
    .eq("company_id", companyId)
    .single();
  if (error || !data) throw new AccessError("公司工作空間未完成設定。", 503);
  const state = appSchema.parse(data.payload);
  if (state.scope?.companyId !== companyId)
    throw new AccessError("工作空間識別不一致。", 409);
  const scope = scopeSchema.parse(state.scope);
  return { ...access, state, scope, revision: data.revision as number };
}
