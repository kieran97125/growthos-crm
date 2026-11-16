import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { renderToStaticMarkup } from "react-dom/server";

const company = "81111111-1111-4111-8111-111111111111";
const actor = "8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
type DatabaseError = { code?: string; message?: string };
type Harness = {
  products: string[];
  reply: { data: unknown; error: DatabaseError | null };
  accessError?: Error;
  transportError?: Error;
  calls: { name: string; args: Record<string, unknown> }[];
  access: string[];
  signals: AbortSignal[];
  reads: string[];
};
const host = globalThis as typeof globalThis & { __webChatReadiness?: Harness };
let api: typeof import("../src/lib/web-chat/server");
let settings: typeof import("../src/app/company/[companyId]/settings/page");

before(async () => {
  const stubs: Record<string, string> = {
    "server-only": "export{};",
    "@/lib/saas/server": [
      'export async function requireCompany(id) {',
      'const h = globalThis.__webChatReadiness; h.access.push(id);',
      'if(h.accessError) throw h.accessError;',
      'return {company:{id,name:"Synthetic readiness company"},',
      'user:{id:"8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"},actor:{role:"owner"},',
      'products:h.products,memberScope:{brandIds:null},db:{',
      'rpc(name,args) {',
      'if(name !== "sv_web_chat_staff_read") throw new Error("unexpected RPC");',
      'h.calls.push({name,args});return {abortSignal(signal) {',
      'h.signals.push(signal);return h.transportError',
      '? Promise.reject(h.transportError):Promise.resolve(h.reply);}};},',
      'from(name) {',
      'if(!["sv_system_cards","sv_memberships"].includes(name)) throw new Error("unexpected table");',
      'h.reads.push(name);return {select(){return {eq(){return Promise.resolve({data:[],error:null});}};}};',
      '}}};}',
    ].join("\n"),
    "@/lib/saas/products": [
      'import {AccessError} from "@/lib/saas/identity";',
      'export function requireProduct(products,p) {',
      'if(!products.includes(p)) throw new AccessError("product_required",403);}',
    ].join("\n"),
    "@/lib/website/transport":
      'export async function fetchWebsite(){throw new Error("provider IO forbidden");}',
    cheerio: 'export function loadBuffer(){throw new Error("HTML scan forbidden");}',
    "next/link": 'import React from "react";export default function Link(p){return React.createElement("a",p,p.children);}',
    "next/navigation": 'export function redirect(p){throw new Error("redirect:"+p);}',
  };
  const output = await build({
    entryPoints: [
      "src/lib/web-chat/server.ts",
      "src/app/company/[companyId]/settings/page.tsx",
    ],
    bundle: true, write: false, outdir: "/virtual-web-chat-readiness",
    outbase: "src", platform: "node", format: "esm", jsx: "automatic",
    plugins: [{
      name: "website-readiness-boundary",
      setup(b) {
        b.onResolve({filter: /.*/}, (args) => args.path in stubs
          ? {path:args.path,namespace:"readiness-stub"} : undefined);
        b.onLoad({filter: /.*/,namespace:"readiness-stub"}, (args) => ({
          contents:stubs[args.path],loader:"js",
        }));
      },
    }],
  });
  const load = async (suffix: string) => {
    const file = output.outputFiles.find((entry) => entry.path.endsWith(suffix));
    assert.ok(file, suffix);
    return import("data:text/javascript;base64," +
      Buffer.from(file.text).toString("base64"));
  };
  api = await load("/lib/web-chat/server.js");
  settings = await load("/app/company/[companyId]/settings/page.js");
});
beforeEach(() => {
  host.__webChatReadiness = {
    products:["crm","pos"],
    reply:{data:{threads:[],canReply:true,scopeStamp:"owner-scope"},error:null},
    calls:[],access:[],signals:[],reads:[],
  };
});
after(() => { delete host.__webChatReadiness; });

test("website readiness makes one bounded tenant/actor staff READ and accepts an empty authorized inbox", async () => {
  const h = host.__webChatReadiness!;
  assert.equal(await api.readChatReadiness(company),"ready");
  assert.deepEqual(h.access,[company]);
  assert.deepEqual(h.calls,[{
    name:"sv_web_chat_staff_read",
    args:{p_company:company,p_actor:actor,p_query:{}},
  }]);
  assert.equal(h.signals.length,1);
  assert.ok(h.signals[0] instanceof AbortSignal);
  assert.equal(h.signals[0].aborted,false);
  assert.deepEqual(h.reads,[]);
});

test("known missing website RPCs and relations are pending; missing core objects stay unavailable", async () => {
  const h = host.__webChatReadiness!;
  for(const error of [
    {code:"PGRST202",message:"Could not find function public.sv_web_chat_staff_read in the schema cache"},
    {code:"PGRST205",message:"Could not find table public.sv_web_chat_threads in the schema cache"},
    {code:"42P01",message:'relation "public.sv_web_chat_threads" does not exist'},
    {code:"42883",message:"function smartvolt_private.web_chat_thread_json does not exist"},
  ]) {
    h.reply={data:null,error};
    assert.equal(api.missingChatSchema(error),true);
    assert.equal(await api.readChatReadiness(company),"pending");
  }
  h.reply={data:null,error:{code:"42883",message:"function public.sv_authorize does not exist"}};
  assert.equal(api.missingChatSchema(h.reply.error),false);
  assert.equal(await api.readChatReadiness(company),"unavailable");
});

test("permission, database and transport failures never enable website chat or claim a missing schema", async () => {
  const h = host.__webChatReadiness!;
  for(const error of [
    {code:"42501",message:"permission denied for function sv_web_chat_staff_read"},
    {code:"P0001",message:"access_denied"},
    {code:"XX000",message:"internal database failure"},
  ]) {
    h.reply={data:null,error};
    assert.equal(api.missingChatSchema(error),false);
    assert.equal(await api.readChatReadiness(company),"unavailable");
  }
  h.transportError=new TypeError("fetch failed");
  assert.equal(await api.readChatReadiness(company),"unavailable");
});

test("null or malformed readiness results cannot enable the website entry", async () => {
  const h = host.__webChatReadiness!;
  for(const data of [
    null,{}, {threads:null,canReply:true,scopeStamp:"scope"},
    {threads:[],scopeStamp:"scope"}, {threads:[],canReply:true,scopeStamp:null},
  ]) {
    h.reply={data,error:null};
    assert.equal(await api.readChatReadiness(company),"unavailable");
  }
});

test("an independent server invocation sees newly installed schema without a sticky false result", async () => {
  const h = host.__webChatReadiness!;
  h.reply={data:null,error:{
    code:"PGRST202",message:"Could not find function public.sv_web_chat_staff_read"}};
  assert.equal(await api.readChatReadiness(company),"pending");
  h.reply={data:{threads:[],canReply:false,scopeStamp:"viewer-scope"},error:null};
  // React cache is inactive outside an RSC request. This verifies no global
  // negative flag survives between invocations; it does not test React internals.
  assert.equal(await api.readChatReadiness(company),"ready");
  assert.equal(h.calls.length,2);
});

test("company and product authorization precede the privileged readiness READ", async () => {
  const h = host.__webChatReadiness!;
  h.accessError=new Error("company access denied");
  await assert.rejects(api.readChatReadiness(company),/company access denied/);
  assert.equal(h.calls.length,0);
  delete h.accessError;
  h.products=["pos"];
  await assert.rejects(api.readChatReadiness(company),/product_required/);
  assert.equal(h.calls.length,0);
});

test("website API errors retain permission/conflict semantics and sanitize missing schema as 503", () => {
  for(const [error,status,pending] of [
    [{code:"PGRST202",message:"Could not find function public.sv_web_chat_settings"},503,true],
    [{code:"42P01",message:'relation "public.sv_web_chat_configs" does not exist'},503,true],
    [{code:"42501",message:"permission denied for function sv_web_chat_settings"},403,false],
    [{message:"access_denied"},403,false],
    [{message:"revision_conflict"},409,false],
    [{message:"chat_rate_limited"},429,false],
    [{message:"chat_session_invalid"},401,false],
    [{code:"XX000",message:"unrelated database failure"},503,false],
  ] as const) {
    assert.throws(() => api.chatFailure(error),(failure: unknown) => {
      const value=failure as Error & {status:number};
      assert.equal(value.status,status);
      assert.equal(value.message.includes("尚未準備完成"),pending);
      assert.doesNotMatch(value.message,/sv_web_chat_|PGRST|42P01|42501/);
      return true;
    });
  }
  assert.doesNotThrow(() => api.chatFailure(null));
});

test("settings hides only the unavailable website link and keeps social and WhatsApp settings", async () => {
  const h = host.__webChatReadiness!;
  for(const [reply,expected] of [
    [{data:{threads:[],canReply:true,scopeStamp:"scope"},error:null},"ready"],
    [{data:null,error:{code:"PGRST202",message:"Could not find function public.sv_web_chat_staff_read"}},"pending"],
    [{data:null,error:{code:"42501",message:"permission denied"}},"unavailable"],
  ] as const) {
    h.reply=reply;
    const html=renderToStaticMarkup(await settings.default({
      params:Promise.resolve({companyId:company}),
    }));
    assert.equal(html.includes('href="/company/'+company+'/settings/website-chat"'),expected==="ready");
    if(expected!=="ready") {
      assert.match(html,/disabled=""/);
      assert.ok(html.includes(expected==="pending"?"準備中":"暫未開放"));
    }
    assert.ok(html.includes("/settings/social-comments"));
    assert.ok(html.includes("/settings/whatsapp"));
  }
});

