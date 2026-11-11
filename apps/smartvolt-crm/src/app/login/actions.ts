"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { authClient } from "@/lib/saas/server";
export async function signIn(_state: { error: string }, form: FormData) {
  const parsed = z
    .object({ email: z.email().max(200), password: z.string().min(1).max(200) })
    .safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "請輸入有效電郵及密碼。" };
  try {
    const client = await authClient();
    const { error } = await client.auth.signInWithPassword(parsed.data);
    if (error)
      return { error: "未能登入，請檢查電郵及密碼，或聯絡公司管理員。" };
  } catch {
    return { error: "登入服務暫時未能使用，請稍後再試。" };
  }
  redirect("/");
}
