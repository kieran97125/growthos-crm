import { sleep } from "workflow";
import { database } from "@/lib/saas/database";
import { processDelivery, checked } from "@/lib/engagement/runtime";
async function tick(company: string, generation: number, token: string) {
  "use step";
  console.info("delivery_tick", { company, generation });
  const r = await database().rpc("sv_delivery_scheduler", {
    p_company: company,
    p_mode: "tick",
    p_generation: generation,
    p_token: token,
  });
  checked(r.error);
  return r.data as { active: boolean; nextAt: string | null; jobs: string[] };
}
async function batch(
  company: string,
  generation: number,
  token: string,
  ids: string[],
) {
  "use step";
  console.info("delivery_batch", { company, generation, count: ids.length });
  for (const id of ids) {
    const fence = await database()
      .from("sv_delivery_schedulers")
      .select("generation,token")
      .eq("company_id", company)
      .single();
    checked(fence.error);
    if (fence.data!.generation !== generation || fence.data!.token !== token)
      break;
    await processDelivery(company, id);
  }
}
async function release(company: string, generation: number, token: string) {
  "use step";
  console.info("delivery_yield", { company, generation });
  const r = await database().rpc("sv_delivery_scheduler", {
    p_company: company,
    p_mode: "release",
    p_generation: generation,
    p_token: token,
  });
  checked(r.error);
}
export async function deliveryWorkflow(
  company: string,
  generation: number,
  token: string,
) {
  "use workflow";
  // Bounded event log; the watchdog rotates the run after 200 batches.
  for (let i = 0; i < 200; i++) {
    const next = await tick(company, generation, token);
    if (!next.active || !next.nextAt) return;
    if (next.jobs.length) await batch(company, generation, token, next.jobs);
    else await sleep(new Date(next.nextAt));
  }
  await release(company, generation, token);
}
