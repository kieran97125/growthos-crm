import { cookies } from "next/headers";
import {
  adminSessionCookieName,
  adminSessionMaxAgeSeconds,
  createSignedAdminSession,
  legacyInternalSessionCookieName,
  verifySignedAdminSession,
  type InternalAccessContext,
  type InternalAction,
  type InternalModule,
} from "@/lib/security/internalAccess";

function openAccessContext(): InternalAccessContext {
  return {
    source: "development_not_configured",
  };
}

export async function getCurrentInternalAccess(): Promise<InternalAccessContext> {
  const cookieStore = await cookies();
  const result = await verifySignedAdminSession(
    cookieStore.get(adminSessionCookieName)?.value
  );

  return result.ok && result.source
    ? { source: result.source }
    : openAccessContext();
}

export async function setAdminSessionCookie() {
  const session = await createSignedAdminSession();
  if (!session) return false;

  const cookieStore = await cookies();
  cookieStore.set(adminSessionCookieName, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: adminSessionMaxAgeSeconds,
  });

  return true;
}

export async function clearInternalSessionCookie() {
  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  } as const;

  cookieStore.set(adminSessionCookieName, "", cookieOptions);
  cookieStore.set(legacyInternalSessionCookieName, "", cookieOptions);
}

export async function requireModuleAccess(_module: InternalModule) {
  void _module;

  return {
    access: await getCurrentInternalAccess(),
    allowed: true,
  };
}

export async function requireActionAccess(_action: InternalAction) {
  void _action;

  return {
    access: await getCurrentInternalAccess(),
    allowed: true,
  };
}
