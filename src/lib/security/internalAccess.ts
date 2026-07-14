export type InternalModule =
  | "crm"
  | "crm_settings";

export type InternalAction =
  | "crm_read"
  | "crm_write"
  | "view_crm_settings";

export type InternalAccessContext = {
  source: "shared_password" | "development_not_configured";
};

type AdminSessionPayload = {
  issuedAt: number;
  expiresAt: number;
};

export const adminSessionCookieName = "growthos_crm_admin_session";
export const legacyInternalSessionCookieName = "launchhub_internal_session";
export const adminSessionMaxAgeSeconds = 60 * 60 * 12;

function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

function getConfiguredPassword() {
  return (
    process.env.GROWTHOS_CRM_ADMIN_PASSWORD?.trim() ||
    process.env.LAUNCHHUB_ADMIN_PASSWORD?.trim() ||
    null
  );
}

function getConfiguredSessionSecret() {
  return (
    process.env.GROWTHOS_CRM_ADMIN_SESSION_SECRET?.trim() ||
    process.env.LAUNCHHUB_ADMIN_SESSION_SECRET?.trim() ||
    null
  );
}

export function hasAdminPasswordGateConfig() {
  return Boolean(getConfiguredPassword() && getConfiguredSessionSecret());
}

export function isAdminPasswordGateEnabled() {
  if (hasAdminPasswordGateConfig()) return true;
  return isProductionRuntime();
}

export function getAdminPasswordGateWarning() {
  if (hasAdminPasswordGateConfig()) return null;
  if (isProductionRuntime()) {
    return "Growth OS CRM admin password gate is missing required environment variables.";
  }
  return "Growth OS CRM admin password gate is not configured in this development environment.";
}

export function verifyAdminPassword(password: string) {
  const configuredPassword = getConfiguredPassword();
  if (!configuredPassword) return false;
  return password === configuredPassword;
}

function base64UrlEncode(value: string | ArrayBuffer) {
  const bytes =
    typeof value === "string"
      ? new TextEncoder().encode(value)
      : new Uint8Array(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function signPayload(payloadValue: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadValue)
  );
  return base64UrlEncode(signature);
}

export async function createSignedAdminSession() {
  const secret = getConfiguredSessionSecret();
  if (!secret) return null;

  const now = Date.now();
  const payload: AdminSessionPayload = {
    issuedAt: now,
    expiresAt: now + adminSessionMaxAgeSeconds * 1000,
  };
  const payloadValue = base64UrlEncode(JSON.stringify(payload));
  const signature = await signPayload(payloadValue, secret);

  return `${payloadValue}.${signature}`;
}

export async function verifySignedAdminSession(cookieValue: string | undefined | null) {
  if (!isAdminPasswordGateEnabled()) {
    return {
      ok: true,
      source: "development_not_configured" as const,
      reason: null,
    };
  }

  const secret = getConfiguredSessionSecret();
  if (!secret || !cookieValue) {
    return {
      ok: false,
      source: null,
      reason: secret ? "missing_cookie" : "missing_secret",
    };
  }

  const [payloadValue, signature] = cookieValue.split(".");
  if (!payloadValue || !signature) {
    return { ok: false, source: null, reason: "invalid_cookie" };
  }

  const expectedSignature = await signPayload(payloadValue, secret);
  if (signature !== expectedSignature) {
    return { ok: false, source: null, reason: "invalid_signature" };
  }

  try {
    const payload = JSON.parse(base64UrlDecode(payloadValue)) as AdminSessionPayload;
    if (!payload.expiresAt || payload.expiresAt < Date.now()) {
      return { ok: false, source: null, reason: "expired" };
    }

    return {
      ok: true,
      source: "shared_password" as const,
      reason: null,
    };
  } catch {
    return { ok: false, source: null, reason: "invalid_payload" };
  }
}
