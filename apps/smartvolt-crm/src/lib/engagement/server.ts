import "server-only";
import { z } from "zod";
import { requireCompany } from "@/lib/saas/server";
import { requireProduct } from "@/lib/saas/products";
import { AccessError } from "@/lib/saas/identity";
import { engagementAction,audienceSchema,type EngagementPage } from "./model";
import { refreshTemplates } from "./runtime";
import { templateComponents } from "./templates";
import { wakeDelivery } from "./scheduler";
export function engagementFailure(e:{message?:string;code?:string}|null){
 if(!e)return;
 if(/access_denied|product_required|brand_scope/.test(e.message??""))throw new AccessError("你無權操作呢個品牌嘅訊息。",403);
 if(/revision_conflict|idempotency_conflict|changed|editor_conflict/.test(e.message??""))throw new AccessError("資料已更新，請重新讀取核對。原有請求紀錄會保留。",409);
 if(/invalid|missing|required|not_ready/.test(e.message??""))throw new AccessError("資料未齊或渠道未就緒，請核對設定。",400);
 throw new AccessError("暫時未能完成操作，請稍後核對同一請求。",503);
}
const querySchema=z.object({brand:z.string().min(1).max(100).optional(),campaign:z.uuid().optional(),after:z.uuid().optional(),before:z.iso.datetime({offset:true}).optional(),beforeId:z.uuid().optional(),customer:z.string().min(1).max(100).optional(),connection:z.uuid().optional(),provider:z.enum(["whatsapp","meta"]).optional(),purpose:z.enum(["marketing","service"]).optional(),tag:z.string().max(40).optional(),stage:z.string().max(100).optional()}).strict();
async function access(company:string){z.uuid().parse(company);const a=await requireCompany(company);requireProduct(a.products,"crm");return a;}
export async function readEngagement(company:string,input:unknown):Promise<EngagementPage>{
 const a=await access(company),q=querySchema.parse(input),{tag,stage,...query}=q;
 const r=await a.db.rpc("sv_engagement_read",{p_company:company,p_actor:a.user.id,p_query:{...query,audience:audienceSchema.parse({tag,stage})}});engagementFailure(r.error);
 const d=r.data as EngagementPage,campaigns=d.campaigns.slice(0,30),results=d.results.slice(0,50),last=campaigns.at(-1);
 return {...d,canManage:["owner","manager"].includes(a.actor.role),canEdit:a.actor.role!=="viewer",campaigns,results,nextCampaign:d.campaigns.length>30&&last?new URLSearchParams({before:last.created_at,beforeId:last.id}).toString():null,nextResult:d.results.length>50?results.at(-1)!.id:null};
}
export async function actEngagement(company:string,input:unknown){
 const a=await access(company),action=engagementAction.parse(input);
 if(a.actor.role==="viewer")throw new AccessError("你目前只有檢視權限。",403);
 if(action.action==="templates"){
  const c=await a.db.from("sv_wa_connections").select("brand_id").eq("company_id",company).eq("id",action.connectionId).single();engagementFailure(c.error);
  const scope=await a.db.rpc("sv_authorize",{p_company:company,p_actor:a.user.id,p_product:"crm",p_write:true,p_manage:true,p_brand:c.data?.brand_id});engagementFailure(scope.error);
  try{return {templates:await refreshTemplates(company,action.connectionId)};}catch{throw new AccessError("未能讀取 Meta 官方模板；請核對 WhatsApp 帳戶授權後再試。",503);}
 }
 const {commandId,action:kind,...data}=action;
 const original=structuredClone(data);
 const replay=await a.db.rpc("sv_engagement_receipt",{p_company:company,p_actor:a.user.id,p_command:commandId,p_kind:kind,p_data:original});engagementFailure(replay.error);
 if(replay.data)return replay.data;
 if(kind==="campaign"||kind==="manual"){
  const campaign=data as Extract<typeof action,{action:"campaign"}>;
  if(campaign.definition.kind==="template"){
   // Inventory refreshes are reads; the send transaction rechecks its exact fingerprint.
   let inventory;try{inventory=await refreshTemplates(company,campaign.connectionId);}catch{throw new AccessError("未能核實官方模板，請重新同步後再排程。",409);}
   const t=inventory.find(t=>t.fingerprint===campaign.definition.fingerprint);if(!t)throw new AccessError("模板已更新，請重新選擇。",409);
   templateComponents(campaign.definition,t);
   campaign.definition.body=t.components.map(raw=>{const c=raw as {type:string;text?:string};return (c.text??"").replace(/{{([^{}]+)}}/g,(_,key)=>campaign.definition.values.find(v=>v.component===c.type.toLowerCase()&&v.key===key)?.value??"");}).filter(Boolean).join("\n");
  }
  if(campaign.provider==="meta"&&campaign.definition.body.length>1000)throw new AccessError("跨 Meta 渠道訊息最多 1,000 字。",400);
 }
 const r=await a.db.rpc("sv_engagement_action",{p_company:company,p_actor:a.user.id,p_command:commandId,p_kind:kind,p_data:data,p_request:original});engagementFailure(r.error);
 if(kind==="campaign"||kind==="manual"||kind==="cancel"){
  try{await wakeDelivery(company);}catch{console.warn("delivery_scheduler_pending",{company});return {...r.data,schedulerPending:true};}
 }
 return r.data;
}
