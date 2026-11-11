import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createCompanyState } from "../src/lib/saas/workspace";
const args = z
  .tuple([
    z.uuid(),
    z.string().min(1).max(100),
    z.string().min(1).max(100),
    z.string().min(1).max(80),
  ])
  .parse(process.argv.slice(2));
const [ownerId, companyName, brandName, ownerName] = args;
const url = process.env.SMARTVOLT_SUPABASE_URL,
  secret = process.env.SMARTVOLT_SUPABASE_SECRET_KEY;
if (!url || !secret)
  throw Error("Configure the dedicated SmartVolt project first.");
const db = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: identity, error: identityError } =
  await db.auth.admin.getUserById(ownerId);
if (identityError || !identity.user?.email_confirmed_at)
  throw Error(
    "The owner must be an existing confirmed Auth identity in the dedicated project.",
  );
const companyId = randomUUID(),
  brandId = randomUUID();
const state = createCompanyState({
  companyId,
  companyName,
  brands: [{ id: brandId, name: brandName, short: brandName.slice(0, 12) }],
  team: [{ id: ownerId, name: ownerName, initials: ownerName.slice(0, 2) }],
});
const { error } = await db.rpc("sv_provision_company", {
  p_id: companyId,
  p_name: companyName,
  p_owner: ownerId,
  p_owner_name: ownerName,
  p_payload: state,
});
if (error) throw Error(`Company provisioning failed (${error.code}).`);
console.log(JSON.stringify({ companyId, route: `/company/${companyId}` }));
