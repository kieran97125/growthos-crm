"use server";
import { redirect } from "next/navigation";
import { authClient, requireUser } from "@/lib/saas/server";
import { newPasswordSchema } from "@/lib/saas/auth-contract";
export async function setPassword(_state: { error: string }, form: FormData) {
  const parsed = newPasswordSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { error: "請輸入至少 12 個字元嘅密碼，並確保兩次輸入相同。" };
  try {
    await requireUser();
    const client = await authClient();
    const { error } = await client.auth.updateUser({
      password: parsed.data.password,
    });
    if (error)
      return { error: "未能更新密碼。請使用最新復原連結，或聯絡管理員。" };
    const { error: signoutError } = await client.auth.signOut({
      scope: "global",
    });
    if (signoutError)
      return { error: "密碼已更新，但未能確認所有登入已登出。請聯絡管理員。" };
  } catch {
    return { error: "登入已過期，請重新登入或使用最新復原連結。" };
  }
  redirect("/login?password=updated");
}
