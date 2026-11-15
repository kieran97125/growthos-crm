import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireCompany, loadCompany, authClient } from "@/lib/saas/server";
import { database } from "@/lib/saas/database";
import { saasConfig } from "@/lib/saas/config";
import { AccessError, canManage } from "@/lib/saas/identity";
import { readMasterKey } from "@/lib/whatsapp/crypto";
import { invitationToken, invitationHash } from "./token";
import {
  teamAction,
  type TeamPage,
  type TeamMember,
  type Invitation,
} from "./model";
function checked(error: { message?: string; code?: string } | null) {
  if (!error) return;
  if (
    /access_denied|product_required|brand_scope|owner_protected/.test(
      error.message ?? "",
    )
  )
    throw new AccessError("你無權修改呢項團隊設定。", 403);
  if (/seat_limit/.test(error.message ?? ""))
    throw new AccessError(
      "公司席位已用盡，請先停用不需要嘅成員或取消邀請。",
      409,
    );
  if (/invitation_expired|invitation_context_changed/.test(error.message ?? ""))
    throw new AccessError(
      "邀請已失效或權限有變，請由公司擁有人重新邀請。",
      409,
    );
  if (/revision|idempotency/.test(error.message ?? ""))
    throw new AccessError("團隊資料已有更新，請重新載入再核對。", 409);
  throw new AccessError("暫時未能完成操作，請用同一操作再試。", 503);
}
function mailOrigin() {
  const origin = new URL(process.env.SMARTVOLT_APP_URL ?? "");
  if (origin.protocol !== "https:" || origin.username || origin.password)
    throw Error("invitation_origin_invalid");
  return origin.origin;
}
function key() {
  return readMasterKey(
    process.env.SMARTVOLT_INVITATION_KEY ??
      process.env.SMARTVOLT_WHATSAPP_ENCRYPTION_KEY,
  );
}
function ready() {
  if (process.env.SMARTVOLT_INVITATIONS_ENABLED !== "true") return false;
  try {
    key();
    mailOrigin();
    return true;
  } catch {
    return false;
  }
}
export async function readTeam(companyId: string): Promise<TeamPage> {
  z.uuid().parse(companyId);
  const a = await loadCompany(companyId);
  if (!canManage(a.actor.role))
    throw new AccessError("團隊權限只供公司管理員查看。", 403);
  const [members, invitations, company, audit] = await Promise.all([
    a.db
      .from("sv_memberships")
      .select(
        "user_id,display_name,role,status,brand_ids,product_ids,access_revision",
      )
      .eq("company_id", companyId)
      .order("created_at"),
    a.db
      .from("sv_staff_invitations")
      .select(
        "id,email,display_name,role,status,mail_state,created_at,expires_at,accepted_at",
      )
      .eq("company_id", companyId)
      .eq("status", "invited")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(100),
    a.db.from("sv_companies").select("seat_limit").eq("id", companyId).single(),
    a.db
      .from("sv_access_audit")
      .select("id,kind,target_user,created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  for (const r of [members, invitations, company, audit]) checked(r.error);
  return {
    companyId,
    checkedAt: new Date().toISOString(),
    canEdit: a.actor.role === "owner",
    seatLimit: company.data!.seat_limit,
    usedSeats:
      (members.data ?? []).filter((m) => m.status === "active").length +
      (invitations.data ?? []).filter(
        (i) => i.status === "invited" && Date.parse(i.expires_at) > Date.now(),
      ).length,
    brands: a.scope.brands,
    products: a.products,
    members: (members.data ?? []) as TeamMember[],
    invitations: (invitations.data ?? []) as Invitation[],
    audit: audit.data ?? [],
    mailReady: ready(),
  };
}
export async function actTeam(companyId: string, raw: unknown) {
  z.uuid().parse(companyId);
  const input = teamAction.parse(raw),
    a = await requireCompany(companyId);
  if (a.actor.role !== "owner")
    throw new AccessError("只有公司擁有人可以邀請或修改成員權限。", 403);
  const { action, commandId, ...rest } = input;
  let token: string | undefined;
  if (action === "invite") {
    if (!ready())
      throw new AccessError("邀請郵件尚未設定，請聯絡系統管理員。", 503);
    token = invitationToken(key(), companyId, commandId);
  }
  const data = {
    ...rest,
    ...(token ? { id: commandId, tokenHash: invitationHash(token) } : {}),
  };
  const saved = await a.db.rpc("sv_team_action", {
    p_company: companyId,
    p_actor: a.user.id,
    p_command: commandId,
    p_action: action,
    p_data: data,
  });
  checked(saved.error);
  if (input.action === "invite" && token) {
    const claim = await a.db.rpc("sv_team_mail_claim", {
      p_company: companyId,
      p_actor: a.user.id,
      p_id: commandId,
    });
    checked(claim.error);
    if (claim.data === true) {
      const redirect = new URL("/auth/invite", mailOrigin());
      redirect.searchParams.set("invitation", commandId);
      redirect.searchParams.set("token", token);
      // One submission only. A crash/timeout remains visible as 'submitting'; never silently send twice.
      try {
        const result = await a.db.auth.admin.inviteUserByEmail(input.email, {
          redirectTo: redirect.toString(),
        });
        let mailError = result.error;
        if (
          mailError?.code === "email_exists" ||
          mailError?.code === "user_already_exists"
        ) {
          const config = saasConfig()!;
          const mail = createClient(config.url, config.key, {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false,
            },
          });
          const existing = await mail.auth.signInWithOtp({
            email: input.email,
            options: {
              shouldCreateUser: false,
              emailRedirectTo: redirect.toString(),
            },
          });
          mailError = existing.error;
        }
        const state = mailError ? "failed" : "submitted";
        const update = await a.db
          .from("sv_staff_invitations")
          .update({ mail_state: state })
          .eq("company_id", companyId)
          .eq("id", commandId)
          .eq("mail_state", "submitting");
        checked(update.error);
      } catch {
        /* Preserve uncertain submission for the owner to inspect; a new invitation revokes it. */
      }
    }
  }
  return readTeam(companyId);
}
const acceptance = z
  .object({
    invitation: z.uuid(),
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    accessToken: z.string().min(20).max(16000),
    refreshToken: z.string().min(10).max(2000),
    password: z.string().min(12).max(128).optional(),
  })
  .strict();
export async function acceptTeam(raw: unknown) {
  const input = acceptance.parse(raw),
    db = database();
  const verified = await db.auth.getUser(input.accessToken);
  const user = verified.data.user;
  if (
    verified.error ||
    !user ||
    user.is_anonymous ||
    !user.email ||
    !user.email_confirmed_at
  )
    throw new AccessError("請用邀請郵件內嘅登入連結接受邀請。", 401);
  const config = saasConfig()!;
  const isolated = createClient(config.url, config.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const pair = await isolated.auth.setSession({
    access_token: input.accessToken,
    refresh_token: input.refreshToken,
  });
  if (pair.error || !pair.data.session || pair.data.user?.id !== user.id)
    throw new AccessError("登入憑證不一致，請重新開啟邀請郵件。", 401);
  const confirmed = await isolated.auth.getUser();
  if (confirmed.error || confirmed.data.user?.id !== user.id)
    throw new AccessError("未能核實登入身份。", 401);
  const accepted = await db.rpc("sv_team_accept", {
    p_invitation: input.invitation,
    p_actor: user.id,
    p_email: user.email,
    p_hash: invitationHash(input.token),
  });
  checked(accepted.error);
  if (input.password) {
    const updated = await isolated.auth.updateUser({
      password: input.password,
    });
    if (updated.error)
      throw new AccessError(
        "成員權限已儲存，但密碼未能設定。請檢查密碼要求後再試。",
        400,
      );
  }
  const client = await authClient();
  const session = await client.auth.setSession(pair.data.session);
  if (session.error)
    throw new AccessError("成員權限已儲存，請重新登入公司帳戶。", 401);
  return { companyId: accepted.data as string };
}
