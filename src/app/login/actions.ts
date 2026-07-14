"use server";

import { redirect } from "next/navigation";
import {
  isAdminPasswordGateEnabled,
  verifyAdminPassword,
} from "@/lib/security/internalAccess";
import { setAdminSessionCookie } from "@/lib/security/internalAccessServer";

function safeNextPath(value: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/crm";
  }
  if (value.startsWith("/login") || value.startsWith("/logout")) {
    return "/crm";
  }
  return value;
}

export async function loginAction(formData: FormData) {
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const password = String(formData.get("password") ?? "");

  if (!isAdminPasswordGateEnabled()) {
    redirect(next);
  }

  if (!verifyAdminPassword(password)) {
    redirect(`/login?next=${encodeURIComponent(next)}&error=invalid_password`);
  }

  const sessionSet = await setAdminSessionCookie();
  if (!sessionSet) {
    redirect(`/login?next=${encodeURIComponent(next)}&error=not_configured`);
  }

  redirect(next);
}
