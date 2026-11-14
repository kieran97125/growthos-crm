import { start,getRun } from "workflow/api";
import { deliveryWorkflow } from "@/workflows/delivery";
import { database } from "@/lib/saas/database";
import { checked } from "./runtime";
export async function wakeDelivery(company:string){
 const db=database(),r=await db.rpc("sv_delivery_scheduler",{p_company:company,p_mode:"wake"});checked(r.error);
 if(r.data.start){
  const run=await start(deliveryWorkflow,[company,r.data.generation,r.data.token]);
  const bound=await db.rpc("sv_delivery_scheduler",{p_company:company,p_mode:"bind",p_generation:r.data.generation,p_token:r.data.token,p_run:run.runId});checked(bound.error);
  return run.runId;
 }
 if(r.data.runId){try{await getRun(r.data.runId).wakeUp();}catch{console.warn("delivery_wake_pending",{company});}}
 return r.data.runId??null;
}
