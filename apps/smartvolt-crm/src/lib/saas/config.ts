export function saasConfig() {
  const url = process.env.SMARTVOLT_SUPABASE_URL;
  const key = process.env.SMARTVOLT_SUPABASE_PUBLISHABLE_KEY;
  const secret = process.env.SMARTVOLT_SUPABASE_SECRET_KEY;
  if (!url || !key || !secret) return null;
  return { url, key, secret };
}
