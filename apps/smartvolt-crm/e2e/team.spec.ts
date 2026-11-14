import {test,expect,type Page} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {build} from "esbuild";
import {readFileSync} from "node:fs";
import {teamAction,type TeamAction,type TeamPage} from "../src/lib/team/model";
const company="11111111-1111-4111-8111-111111111111",owner="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",colleague="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let bundle="";
const styles=["src/app/saas.css","src/components/team/team.css"].map(p=>readFileSync(p,"utf8")).join("\n");
test.beforeAll(async()=>{bundle=(await build({stdin:{loader:"tsx",resolveDir:process.cwd(),contents:"import React from'react';import{createRoot}from'react-dom/client';import TeamSettings from'./src/components/team/TeamSettings';createRoot(document.getElementById('fixture')).render(<TeamSettings initial={window.__TEAM__}/>);"},bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",loader:{".css":"empty"},define:{"process.env.NODE_ENV":'"test"'}})).outputFiles[0].text;});
async function fixture(page:Page,{viewer=false,lost=false,configured=true}={}){
 const now=new Date().toISOString();const data:TeamPage={companyId:company,checkedAt:now,canEdit:!viewer,seatLimit:5,usedSeats:2,brands:[{id:"main",name:"Studio"},{id:"other",name:"Clinic"}],products:["crm","pos"],mailReady:configured,members:[{user_id:owner,display_name:"Mia",role:"owner",status:"active",brand_ids:null,product_ids:null,access_revision:0},{user_id:colleague,display_name:"Alex",role:"agent",status:"active",brand_ids:["main"],product_ids:["crm"],access_revision:2}],invitations:[],audit:[]};
 const commands:TeamAction[]=[],receipts=new Map<string,TeamPage>();let dropped=false;
 await page.route(`**/api/companies/${company}/team`,async r=>{
  if(r.request().method()==="GET"){await r.fulfill({json:data});return;}
  const c=teamAction.parse(r.request().postDataJSON());commands.push(c);
  if(viewer){await r.fulfill({status:403,json:{error:"只有公司擁有人可以修改。"}});return;}
  if(!receipts.has(c.commandId)){
   if(c.action==="invite"){data.invitations.push({id:c.commandId,email:c.email,display_name:c.name,role:c.role,status:"invited",mail_state:"submitted",created_at:now,expires_at:new Date(Date.now()+7*86400000).toISOString(),accepted_at:null});data.usedSeats++;}
   if(c.action==="member"){const m=data.members.find(m=>m.user_id===c.userId)!;expect(c.revision).toBe(m.access_revision);Object.assign(m,{display_name:c.name,role:c.role,status:c.status,brand_ids:c.brandIds,product_ids:c.productIds,access_revision:m.access_revision+1});}
   if(c.action==="revoke"){data.invitations.find(i=>i.id===c.id)!.status="revoked";data.usedSeats--;}
   receipts.set(c.commandId,structuredClone(data));
  }
  if(lost&&!dropped){dropped=true;await r.abort("failed");return;}
  await r.fulfill({json:receipts.get(c.commandId)});
 });
 await page.route("**/__acceptance/team.js",r=>r.fulfill({contentType:"text/javascript",body:bundle}));
 await page.route(`**/company/${company}/settings/team`,r=>r.fulfill({contentType:"text/html",body:`<!doctype html><html lang="zh-HK"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Team acceptance · synthetic</title><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,'Noto Sans CJK TC',sans-serif;background:#f7f9f9}${styles}</style></head><body><main id="fixture"></main><script>window.__TEAM__=${JSON.stringify(data)}</script><script src="/__acceptance/team.js"></script></body></html>`}));
 await page.goto(`/company/${company}/settings/team`);await expect(page.getByRole("heading",{name:"同事與權限"})).toBeVisible();return{data,commands};
}
for(const mobile of [false,true])test(`${mobile?"mobile":"desktop"}: invitations, scoped member edit, keyboard and accessibility`,async({page},info)=>{
 if(mobile)await page.setViewportSize({width:390,height:844});const f=await fixture(page);
 await page.getByRole("button",{name:"邀請同事",exact:true}).click();const dialog=page.getByRole("dialog");await expect(dialog).toBeVisible();await page.getByLabel("同事名稱").fill("Sam");await page.getByLabel("工作電郵").fill("sam@example.invalid");
 await page.getByText("品牌範圍 · 全部品牌",{exact:true}).click();await page.getByLabel("全部品牌（包括日後新增）").uncheck();await page.getByLabel("Clinic",{exact:true}).check();await page.getByLabel("POS",{exact:true}).uncheck();
 const violations=(await new AxeBuilder({page}).analyze()).violations.filter(v=>["critical","serious"].includes(v.impact??""));expect(violations).toEqual([]);
 await page.screenshot({path:info.outputPath(`team-${mobile?"mobile":"desktop"}.png`),fullPage:true});
 await page.getByRole("button",{name:"寄出邀請",exact:true}).click();await expect(dialog).not.toBeVisible();await expect(page.getByText("郵件已提交 · 等待對方接受",{exact:false})).toBeVisible();expect(f.commands[0]).toMatchObject({action:"invite",brandIds:["other"],productIds:["crm"]});
 await page.getByRole("button",{name:"管理權限",exact:true}).click();await page.getByLabel("使用狀態").selectOption("suspended");await page.getByRole("button",{name:"儲存權限",exact:true}).click();await expect(page.getByText("客服同事 · 已停用",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"管理權限",exact:true}).click();await page.keyboard.press("Escape");await expect(dialog).not.toBeVisible();await expect(page.getByRole("button",{name:"管理權限",exact:true})).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test("a lost invitation response freezes the same command and never creates a second invite",async({page})=>{
 const f=await fixture(page,{lost:true});await page.getByRole("button",{name:"邀請同事",exact:true}).click();await page.getByLabel("同事名稱").fill("Sam");await page.getByLabel("工作電郵").fill("sam@example.invalid");await page.getByRole("button",{name:"寄出邀請",exact:true}).click();await expect(page.getByRole("alert")).toBeVisible();await expect(page.getByLabel("工作電郵")).toBeDisabled();await page.getByRole("button",{name:"重試同一操作",exact:true}).click();await expect(page.getByRole("dialog")).not.toBeVisible();expect(f.commands).toHaveLength(2);expect(f.commands[1]).toEqual(f.commands[0]);expect(f.data.invitations).toHaveLength(1);
});
test("managers can inspect members while only the owner sees mutation controls",async({page})=>{
 await fixture(page,{viewer:true});await expect(page.getByRole("button",{name:"邀請同事",exact:true})).toHaveCount(0);await expect(page.getByRole("button",{name:"管理權限",exact:true})).toHaveCount(0);await expect(page.getByText("Alex",{exact:true})).toBeVisible();
});
test("mail configuration blocks new invitations while existing member management remains available",async({page})=>{
 await fixture(page,{configured:false});await expect(page.getByRole("button",{name:"邀請同事",exact:true})).toBeDisabled();await expect(page.getByRole("button",{name:"管理權限",exact:true})).toBeEnabled();await expect(page.getByRole("status")).toContainText("邀請郵件尚未設定");
});
