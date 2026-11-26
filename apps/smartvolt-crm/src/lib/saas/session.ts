import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { saasConfig } from "./config";
import { AccessError } from "./identity";

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
