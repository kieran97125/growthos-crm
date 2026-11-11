import { getVercelOidcTokenSync } from "@vercel/oidc";
/** Runtime OIDC is a rotating request-context header; it need not be an env var. */
export function gatewayConfigured() {
  if (!process.env.AI_GATEWAY_MODEL) return false;
  if (process.env.AI_GATEWAY_API_KEY) return true;
  try {
    return !!getVercelOidcTokenSync();
  } catch {
    return false;
  }
}
