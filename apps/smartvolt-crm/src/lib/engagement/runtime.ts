import { z } from "zod";
import { hkdfSync } from "node:crypto";
import { database } from "@/lib/saas/database";
import { decryptCredentials, readMasterKey } from "@/lib/whatsapp/crypto";
import { sendTemplate, sendText } from "@/lib/whatsapp/graph";
import { sendMetaText } from "@/lib/meta/graph";
import { definitionSchema } from "./model";
import { fetchTemplates, templateComponents } from "./templates";
import type { WaIdentity, WaSendResult } from "@/lib/whatsapp/types";
export function checked(error: { message?: string; code?: string } | null) {
  if (error) throw new Error(error.message ?? "database_unavailable");
}
export async function waConnection(company: string, id: string) {
  const q = await database()
    .from("sv_wa_connections")
    .select("*")
    .eq("company_id", company)
    .eq("id", id)
    .single();
  checked(q.error);
  const row = q.data!;
  const secrets = z
    .object({ accessToken: z.string().min(16), appSecret: z.string() })
    .parse(
      decryptCredentials(
        row.encrypted_credentials,
        readMasterKey(),
        company,
        id,
      ),
    );
  return {
    row,
    credentials: {
      phoneNumberId: row.phone_number_id as string,
      accessToken: secrets.accessToken,
      version: process.env.SMARTVOLT_WHATSAPP_GRAPH_VERSION || undefined,
    },
  };
}
export async function refreshTemplates(company: string, id: string) {
  const { row, credentials } = await waConnection(company, id);
  if (row.state === "disabled") throw Error("connection_not_ready");
  const templates = await fetchTemplates(row.account_id, credentials);
  const r = await database().rpc("sv_templates_store", {
    p_company: company,
    p_connection: id,
    p_expected: row.encrypted_credentials,
    p_templates: templates,
  });
  checked(r.error);
  return templates;
}
/** May be retried by the execution engine: the transaction only admits one POST. */
export async function processDelivery(company: string, id: string) {
  const db = database();
  const peek = await db
    .from("sv_delivery_jobs")
    .select("provider,connection_id,payload,state")
    .eq("company_id", company)
    .eq("id", id)
    .single();
  checked(peek.error);
  if (peek.data!.state !== "scheduled") return { dispatched: false };
  let templates: Awaited<ReturnType<typeof refreshTemplates>> = [];
  if (peek.data!.payload.kind === "template") {
    try {
      templates = await refreshTemplates(company, peek.data!.connection_id);
    } catch {
      // Read failure cannot authorize a stale inventory, and no POST has happened.
      const stale = await db.rpc("sv_templates_invalidate", {
        p_company: company,
        p_connection: peek.data!.connection_id,
      });
      checked(stale.error);
    }
  }
  const claim = await db.rpc("sv_delivery_claim", {
    p_company: company,
    p_id: id,
  });
  checked(claim.error);
  if (!claim.data?.dispatch) return { dispatched: false };
  const { job, messageId, remoteId, remoteKind } = claim.data;
  let outcome: WaSendResult;
  // Validate/decrypt all local configuration before entering the provider attempt.
  let post: () => Promise<WaSendResult>;
  try {
    const definition = definitionSchema.parse(job.payload);
    if (job.provider === "whatsapp") {
      const { row, credentials } = await waConnection(
        company,
        job.connection_id,
      );
      const to: WaIdentity =
        remoteKind === "phone"
          ? {
              kind: "phone",
              id: remoteId,
              phone: remoteId,
              bsuid: null,
              parentBsuid: null,
            }
          : {
              kind: "bsuid",
              id: remoteId,
              phone: null,
              bsuid: remoteId,
              parentBsuid: null,
            };
      if (!["phone", "bsuid"].includes(remoteKind) || row.state !== "active")
        throw new Error("connection_changed");
      const common = {
        ...credentials,
        to,
        opaqueCallbackData: messageId,
        ...(row.messaging_account_id
          ? { messagingAccountId: row.messaging_account_id }
          : {}),
      };
      if (definition.kind === "template") {
        const template = templates.find(
          (t) => t.fingerprint === definition.fingerprint,
        );
        if (!template) throw new Error("template_changed");
        const components = templateComponents(definition, template);
        post = () =>
          sendTemplate({
            ...common,
            name: definition.name!,
            locale: definition.locale!,
            components,
          });
      } else post = () => sendText({ ...common, text: definition.body });
    } else {
      const connection = await db
        .from("sv_meta_connections")
        .select("credentials,account_id,channel,app_id,enabled")
        .eq("company_id", company)
        .eq("id", job.connection_id)
        .single();
      checked(connection.error);
      const c = connection.data!;
      if (!c.enabled || c.app_id !== process.env.SMARTVOLT_META_APP_ID)
        throw new Error("connection_changed");
      const token = z
        .string()
        .min(20)
        .parse(
          decryptCredentials(
            c.credentials,
            Buffer.from(
              hkdfSync(
                "sha256",
                readMasterKey(),
                "convelta-meta",
                "credentials-v1",
                32,
              ),
            ),
            `meta:${company}`,
            job.connection_id,
          ).token,
        );
      const channel = z.enum(["messenger", "instagram"]).parse(c.channel);
      post = async () => {
        const r = await sendMetaText(
          c.account_id,
          channel,
          remoteId,
          definition.body,
          token,
        );
        return r.state === "accepted"
          ? { ok: true, accepted: true, providerId: r.mid! }
          : {
              ok: false,
              disposition: r.state === "uncertain" ? "ambiguous" : "definitive",
              code:
                r.state === "uncertain"
                  ? "delivery_unknown"
                  : "provider_rejected",
            };
      };
    }
  } catch {
    outcome = { ok: false, disposition: "definitive", code: "invalid_request" };
    const r = await db.rpc("sv_delivery_finish", {
      p_company: company,
      p_job: id,
      p_disposition: outcome.disposition,
      p_provider_id: null,
      p_error: outcome.code,
    });
    checked(r.error);
    return { dispatched: false };
  }
  try {
    outcome = await post();
  } catch {
    outcome = { ok: false, disposition: "ambiguous", code: "delivery_unknown" };
  }
  const finish = await db.rpc("sv_delivery_finish", {
    p_company: company,
    p_job: id,
    p_disposition: outcome.ok ? "accepted" : outcome.disposition,
    p_provider_id: outcome.ok ? outcome.providerId : null,
    p_error: outcome.ok ? null : outcome.code,
  });
  checked(finish.error);
  return { dispatched: true };
}
