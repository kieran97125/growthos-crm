import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
const url = process.env.SMARTVOLT_SUPABASE_URL,
  secret = process.env.SMARTVOLT_SUPABASE_SECRET_KEY;
if (!url || !secret)
  throw Error("Configure only the dedicated SmartVolt project.");
const db = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  }),
  args = process.argv.slice(2);
if (args.length === 0) {
  const { data, error } = await db
    .from("sv_companies")
    .select(
      "id,name,status,sv_company_products(product,status,starts_at,ends_at)",
    );
  if (error) throw Error("Cannot read company product registry.");
  const now = Date.now();
  console.log(
    JSON.stringify(
      data?.map((c) => {
        const products = c.sv_company_products
          .filter(
            (p) =>
              p.status === "active" &&
              Date.parse(p.starts_at) <= now &&
              (!p.ends_at || Date.parse(p.ends_at) > now),
          )
          .map((p) => p.product)
          .sort();
        return {
          companyId: c.id,
          companyName: c.name,
          status: c.status,
          products,
          cohort:
            products.length === 2
              ? "CRM + POS"
              : (products[0]?.toUpperCase() ?? "NO ACTIVE PRODUCTS"),
        };
      }),
      null,
      2,
    ),
  );
} else {
  const [company, selection] = z
    .tuple([z.uuid(), z.enum(["crm", "pos", "crm,pos", "none"])])
    .parse(args);
  const { error } = await db.rpc("sv_set_company_products", {
    p_company: company,
    p_products: selection === "none" ? [] : selection.split(","),
  });
  if (error) throw Error(`Product registration failed (${error.code}).`);
  console.log(JSON.stringify({ companyId: company, products: selection }));
}
