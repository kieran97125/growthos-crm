import "server-only";
import { createClient } from "@supabase/supabase-js";

export type SupabaseAdminEnvStatus = {
  ready: boolean;
  reason: string | null;
  urlPresent: boolean;
  serviceRoleKeyPresent: boolean;
  serviceRoleKeyLooksLikeAnon: boolean;
  serviceRoleKeyRole: string | null;
};

export function hasSupabaseAdminEnv() {
  return getSupabaseAdminEnvStatus().ready;
}

export function getSupabaseAdminEnvStatus(): SupabaseAdminEnvStatus {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";
  const serviceRoleKeyRole = getJwtRole(serviceRoleKey);
  const serviceRoleKeyLooksLikeAnon =
    Boolean(serviceRoleKey && anonKey && serviceRoleKey === anonKey) ||
    serviceRoleKeyRole === "anon" ||
    serviceRoleKeyRole === "authenticated";

  if (!url) {
    return {
      ready: false,
      reason: "NEXT_PUBLIC_SUPABASE_URL is missing.",
      urlPresent: false,
      serviceRoleKeyPresent: Boolean(serviceRoleKey),
      serviceRoleKeyLooksLikeAnon,
      serviceRoleKeyRole,
    };
  }

  if (!serviceRoleKey) {
    return {
      ready: false,
      reason: "SUPABASE_SERVICE_ROLE_KEY is missing.",
      urlPresent: true,
      serviceRoleKeyPresent: false,
      serviceRoleKeyLooksLikeAnon,
      serviceRoleKeyRole,
    };
  }

  if (serviceRoleKeyLooksLikeAnon) {
    return {
      ready: false,
      reason:
        "SUPABASE_SERVICE_ROLE_KEY appears to be an anon/authenticated key, not a service-role/admin key.",
      urlPresent: true,
      serviceRoleKeyPresent: true,
      serviceRoleKeyLooksLikeAnon,
      serviceRoleKeyRole,
    };
  }

  return {
    ready: true,
    reason: null,
    urlPresent: true,
    serviceRoleKeyPresent: true,
    serviceRoleKeyLooksLikeAnon: false,
    serviceRoleKeyRole,
  };
}

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const status = getSupabaseAdminEnvStatus();

  if (!url || !key || !status.ready) {
    throw new Error(status.reason ?? "Supabase service-role/admin client is not configured.");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getJwtRole(value: string) {
  const parts = value.split(".");
  if (parts.length < 2) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(parts[1])) as { role?: unknown };
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf8");
}
