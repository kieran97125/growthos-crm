import { runBounded } from "@/lib/engagement/bounded";
import { database } from "@/lib/saas/database";
import { readMasterKey, decryptCredentials } from "@/lib/whatsapp/crypto";
import { checked } from "@/lib/engagement/runtime";
import {
  buildFeedbackEvent,
  postFeedback,
  type AdmittedFeedback,
} from "./graph";
export async function dispatchFeedback(company: string) {
  const db = database();
  checked((await db.rpc("sv_feedback_prepare", { p_company: company })).error);
  const jobs = await db
    .from("sv_feedback_jobs")
    .select("id,brand_id")
    .eq("company_id", company)
    .eq("state", "scheduled")
    .order("created_at")
    .order("id")
    .limit(10);
  checked(jobs.error);
  await runBounded(jobs.data ?? [], 5, async (j) => {
    const r = await db
      .from("sv_feedback_settings")
      .select("dataset_id,mode,test_code,encrypted_credentials,revision")
      .eq("company_id", company)
      .eq("brand_id", j.brand_id)
      .single();
    checked(r.error);
    const setting = r.data!;
    let token: string;
    try {
      token = decryptCredentials(
        setting.encrypted_credentials,
        readMasterKey(),
        company,
        "feedback:" + j.brand_id,
      ).token as string;
      if (!token) throw Error();
    } catch {
      return;
    }
    const a = await db.rpc("sv_feedback_claim", {
      p_company: company,
      p_job: j.id,
      p_revision: setting.revision,
    });
    checked(a.error);
    if (!a.data.dispatch) return;
    let result;
    try {
      const event = buildFeedbackEvent(company, a.data as AdmittedFeedback);
      result = await postFeedback(
        setting.dataset_id,
        token,
        event,
        setting.mode === "test" ? setting.test_code : null,
      );
    } catch {
      result = {
        state: "failed",
        reason: "source_payload_invalid",
        receipt: {},
      };
    }
    checked(
      (
        await db.rpc("sv_feedback_finish", {
          p_company: company,
          p_job: j.id,
          p_state: result.state,
          p_reason: result.reason,
          p_receipt: result.receipt,
        })
      ).error,
    );
  });
}
