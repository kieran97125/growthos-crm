import type { InternalModule } from "@/lib/security/internalAccess";

export const publicExactRoutes = ["/login", "/logout"] as const;

export const internalRoutePrefixes = ["/crm"] as const;

export function isPublicRoute(pathname: string) {
  return publicExactRoutes.includes(pathname as (typeof publicExactRoutes)[number]);
}

export function isInternalRoute(pathname: string) {
  if (isPublicRoute(pathname)) return false;
  if (pathname === "/") return true;
  return internalRoutePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function getInternalRouteModule(pathname: string): InternalModule | null {
  if (!isInternalRoute(pathname)) return null;
  if (pathname.startsWith("/crm/settings")) return "crm_settings";
  return "crm";
}
