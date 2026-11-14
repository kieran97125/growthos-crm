import { createHash } from "node:crypto";
import { factsFor, observations } from "@/lib/copilot/observations";
import {
  snapshotSchema,
  type Feedback,
  type Snapshot,
} from "@/lib/copilot/model";
import { database } from "@/lib/saas/database";
import { checked } from "@/lib/engagement/runtime";

/** Reuses C's deterministic, source-bound rules. Never invokes an AI model. */
export function backgroundObservations(
  snapshot: Snapshot,
  feedback: Feedback[],
) {
  const facts = factsFor(snapshot);
  return observations(
    snapshot,
    {
      product: "crm",
      section: "operations",
      brandId: snapshot.brandId ?? undefined,
      activity: "viewing",
    },
    feedback,
  )
    .filter((o) => ["overdue", "reactivation", "conversion"].includes(o.family))
    .slice(0, 3)
    .map((o) => {
      const relevant =
        o.family === "overdue"
          ? ["overdue", "brand-scope"]
          : o.family === "reactivation"
            ? ["dormant", "broadcast", "brand-scope"]
            : ["conversion", "brand-scope"];
      const sourceFacts = facts
        .filter(
          (f) =>
            relevant.includes(f.id) ||
            (o.family === "conversion" &&
              f.id.startsWith("segment:") &&
              o.title.includes(f.label)),
        )
        .slice(0, 8);
      return {
        ...o,
        // The live C key identifies feedback; the persisted notification adds a
        // collision-resistant digest of source facts without exposing their text.
        key:
          o.key +
          ":" +
          createHash("sha256")
            .update(
              JSON.stringify([
                snapshot.brandId,
                o.family,
                o.subject,
                o.evidence,
                sourceFacts.map((f) => [f.id, f.value]),
              ]),
            )
            .digest("hex")
            .slice(0, 24),
        feedbackKey: o.key,
        facts: sourceFacts,
      };
    });
}

export async function syncBackgroundObservations(
  company: string,
  actor: string,
) {
  const db = database();
  const c = await db.rpc("sv_copilot_background_context", {
    p_company: company,
    p_actor: actor,
  });
  checked(c.error);
  const context = c.data as { brands: string[]; feedback: Feedback[] };
  for (const brand of context.brands) {
    const r = await db.rpc("sv_copilot_snapshot", {
      p_company: company,
      p_actor: actor,
      p_product: "crm",
      p_brand: brand,
      p_customer: null,
    });
    checked(r.error);
    const snapshot = snapshotSchema.parse(r.data);
    const saved = await db.rpc("sv_copilot_background_record", {
      p_company: company,
      p_actor: actor,
      p_brand: brand,
      p_checked: snapshot.at,
      p_rows: backgroundObservations(snapshot, context.feedback),
    });
    checked(saved.error);
  }
}
