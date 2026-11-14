import { createClient } from "@supabase/supabase-js";
import { saasConfig } from "./config";
import { AccessError } from "./identity";
/** Private runtime client; separated from cookies so durable steps can use it. */
export function database() {
  const config = saasConfig();
  if (!config) throw new AccessError("公司資料服務尚未啟用。", 503);
  return createClient(config.url, config.secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
