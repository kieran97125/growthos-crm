// Rebuild explicit overrides from the application's own immutable migration history.
// Fails if a source anchor changes; no dynamic SQL rewriting runs in production.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const directory = new URL("../supabase/migrations/", import.meta.url);
const latest = new Map();
for (const file of readdirSync(directory).sort()) {
  if (file > "20261113202249_convelta_inbox_translation.sql") continue;
  const sql = readFileSync(new URL(file, directory), "utf8");
  for (const match of sql.matchAll(
    /create(?: or replace)? function\s+(?:public|smartvolt_private)\.(\w+)\s*\([\s\S]*?\$\$;/gi,
  ))
    latest.set(match[1], match[0]);
}
const output = [];
function edit(name, replacements) {
  let sql = latest.get(name);
  if (!sql) throw Error(`Missing source: ${name}`);
  sql = sql.replace(
    /^create(?: or replace)? function/i,
    "create or replace function",
  );
  for (const [from, to, count = 1] of replacements) {
    const found =
      typeof from === "string"
        ? sql.split(from).length - 1
        : [...sql.matchAll(from)].length;
    if (count !== null && found !== count)
      throw Error(`${name}: expected ${count}, got ${found} for ${from}`);
    if (found === 0) throw Error(`${name}: missing anchor ${from}`);
    sql =
      typeof from === "string"
        ? sql.replaceAll(from, to)
        : sql.replace(from, to);
  }
  output.push(sql);
}
const check = (brand, product = "'crm'") =>
  `perform public.sv_member_scope(p_company,p_actor,${brand},${product});`;
const thread = (provider, id) =>
  `perform public.sv_thread_scope(p_company,p_actor,${provider},${id});`;
const guardAfterAuth = (name, auth, guard) =>
  edit(name, [[auth, `${auth}\n ${guard}`]]);
edit("sv_meta_authorize", [
  [
    "return r;",
    "if not smartvolt_private.member_has_product(p_company,p_actor,'crm')then raise exception 'meta_product_required';end if;return r;",
  ],
]);
edit("wa_require_actor", [
  [
    "return v_role;",
    "if not smartvolt_private.member_has_product(p_company,p_actor,'crm')then raise exception 'access_denied';end if;return v_role;",
  ],
]);
edit("sv_customer_authorize", [
  [
    "return r;",
    "if (p_crm and not smartvolt_private.member_has_product(p_company,p_actor,'crm'))or(not p_crm and not(smartvolt_private.member_has_product(p_company,p_actor,'crm')or smartvolt_private.member_has_product(p_company,p_actor,'pos')))then raise exception 'customer_product_required';end if;return r;",
  ],
]);
edit("sv_copilot_authorize", [
  [
    "if not found then raise exception 'copilot_product_required';end if;",
    "if not found or not smartvolt_private.member_has_product(p_company,p_actor,p_product)then raise exception 'copilot_product_required';end if;",
  ],
]);
for (const [name, provider, id, auth] of [
  [
    "sv_wa_claim_send",
    "'whatsapp'",
    "p_conversation",
    "perform smartvolt_private.wa_require_actor(p_company,p_actor);",
  ],
  [
    "sv_wa_conversation_command",
    "'whatsapp'",
    "p_conversation",
    "perform smartvolt_private.wa_require_actor(p_company,p_actor);",
  ],
  [
    "sv_meta_claim",
    "'meta'",
    "p_thread",
    "perform public.sv_meta_authorize(p_company,p_actor,true,false);",
  ],
  [
    "sv_meta_command",
    "'meta'",
    "p_thread",
    "perform public.sv_meta_authorize(p_company,p_actor,true,false);",
  ],
  [
    "sv_meta_manage_thread",
    "'meta'",
    "p_thread",
    "perform public.sv_meta_authorize(p_company,p_actor,true,false);",
  ],
  [
    "sv_wa_manage_thread",
    "'whatsapp'",
    "p_thread",
    "perform public.sv_meta_authorize(p_company,p_actor,true,false);",
  ],
  [
    "sv_ops_context",
    "p_provider",
    "p_thread",
    "perform public.sv_customer_authorize(p_company,p_actor,false,true);",
  ],
  [
    "sv_inquiry_auto_assign",
    "p_provider",
    "p_thread",
    "perform public.sv_customer_authorize(p_company,p_actor,true,true);",
  ],
  [
    "sv_inquiry_meta_note",
    "'meta'",
    "p_thread",
    "perform public.sv_customer_authorize(p_company,p_actor,true,true);",
  ],
])
  guardAfterAuth(name, auth, thread(provider, id));
guardAfterAuth(
  "sv_customer_relink",
  "perform public.sv_customer_authorize(p_company,p_actor,true,true);",
  `${thread("p_provider", "p_thread")}perform public.sv_customer_scope(p_company,p_actor,p_customer);`,
);
guardAfterAuth(
  "sv_customer_update",
  "perform public.sv_customer_authorize(p_company,p_actor,true);",
  "perform public.sv_customer_scope(p_company,p_actor,p_customer,true);",
);
guardAfterAuth(
  "sv_ai_claim",
  "perform public.sv_ai_authorize(p_company,p_actor);",
  check("p_brand"),
);
guardAfterAuth(
  "sv_translation_claim",
  "perform public.sv_ai_authorize(p_company,p_actor);",
  check("p_data->>'brandId'"),
);
edit("sv_website_access", [["begin", `begin\n ${check("p_brand")}`]]);
edit("sv_customer_list", [
  [
    "c.company_id=p_company and(p_after",
    "c.company_id=p_company and exists(select 1 from public.sv_customer_brands sb where sb.company_id=c.company_id and sb.customer_id=c.id and smartvolt_private.member_brand_allowed(p_company,p_actor,sb.brand_id))and(p_after",
  ],
  [
    "b.brand_id=p_brand)",
    "b.brand_id=p_brand and smartvolt_private.member_brand_allowed(p_company,p_actor,b.brand_id))",
  ],
]);
guardAfterAuth(
  "sv_commit_booking",
  "perform public.sv_customer_authorize(p_company,p_actor,true,true);",
  "perform public.sv_authorize(p_company,p_actor,'pos',true);" +
    check(
      "(select brand_id from public.sv_booking_requests where company_id=p_company and id=p_request)",
      "'pos'",
    ),
);
edit("sv_booking_request", [
  [
    "req=jsonb_build_object",
    `if p_action='create'then ${thread("p_data->>'provider'", "(p_data->>'threadId')::uuid")}else perform public.sv_member_scope(p_company,p_actor,(select brand_id from public.sv_booking_requests where company_id=p_company and id=p_id));end if;\n req=jsonb_build_object`,
  ],
]);
edit("sv_ops_action", [
  [
    "req=jsonb_build_object",
    `if p_action in('settings','agent')and exists(select 1 from public.sv_memberships where company_id=p_company and user_id=p_actor and brand_ids is not null)then raise exception 'ops_brand_scope';end if;
 if p_action='stage'then ${check("p_data->>'brandId'")}elsif p_action in('handoff','followup-create')then ${thread("p_data->>'provider'", "(p_data->>'threadId')::uuid")}elsif p_action='followup-update'then ${check("(select brand_id from public.sv_followup_tasks where company_id=p_company and id=(p_data->>'id')::uuid)")}end if;
 req=jsonb_build_object`,
  ],
]);
for (const name of ["sv_ops_read", "sv_ops_tasks", "sv_copilot_snapshot"]) {
  const replacements = [
    [
      /\(p_brand is null or ([a-z]+)\.brand_id=p_brand\)/g,
      "(smartvolt_private.member_brand_allowed(p_company,p_actor,$1.brand_id)and(p_brand is null or $1.brand_id=p_brand))",
      null,
    ],
  ];
  if (name === "sv_ops_read")
    replacements.push(
      [
        "select payload#>'{scope,brands}'into strict brands",
        "select(select jsonb_agg(b)from jsonb_array_elements(payload#>'{scope,brands}')b where smartvolt_private.member_brand_allowed(p_company,p_actor,b->>'id'))into strict brands",
      ],
      [
        "pos=exists(",
        "pos=smartvolt_private.member_has_product(p_company,p_actor,'pos')and exists(",
      ],
      [
        "i.company_id=p_company and i.assignee_id=m.user_id",
        "i.company_id=p_company and smartvolt_private.member_brand_allowed(p_company,p_actor,i.brand_id)and i.assignee_id=m.user_id",
      ],
    );
  if (name === "sv_copilot_snapshot")
    replacements.push(
      [
        "has_crm=exists(",
        "has_crm=smartvolt_private.member_has_product(p_company,p_actor,'crm')and exists(",
      ],
      [
        "has_pos=exists(",
        "has_pos=smartvolt_private.member_has_product(p_company,p_actor,'pos')and exists(",
      ],
      [
        "select * into strict doc",
        "if p_brand is not null then perform public.sv_member_scope(p_company,p_actor,p_brand,p_product);end if;\n select * into strict doc",
      ],
      [
        "'brands',doc.payload#>'{scope,brands}'",
        "'brands',(select coalesce(jsonb_agg(b),'[]'::jsonb)from jsonb_array_elements(doc.payload#>'{scope,brands}')b where smartvolt_private.member_brand_allowed(p_company,p_actor,b->>'id'))",
      ],
      [
        "case when p_product='pos'or exists(",
        "case when p_product='pos'or has_pos and exists(",
      ],
      [
        "and(p_brand is null or a->>'brandId'=p_brand)",
        "and smartvolt_private.member_brand_allowed(p_company,p_actor,a->>'brandId')and(p_brand is null or a->>'brandId'=p_brand)",
        2,
      ],
      [
        "and(p_brand is null or brand_id=p_brand)",
        "and smartvolt_private.member_brand_allowed(p_company,p_actor,brand_id)and(p_brand is null or brand_id=p_brand)",
        2,
      ],
    );
  edit(name, replacements);
}
edit("sv_inbox_list", [
  [
    "c.id=t.connection_id where t.company_id=p_company",
    "c.id=t.connection_id where t.company_id=p_company and smartvolt_private.member_brand_allowed(p_company,p_actor,c.brand_id)",
  ],
  [
    "from public.sv_wa_conversations t where t.company_id=p_company",
    "from public.sv_wa_conversations t where t.company_id=p_company and smartvolt_private.member_brand_allowed(p_company,p_actor,t.brand_id)",
  ],
]);
edit("sv_meta_inbox_list", [
  [
    "where t.company_id=p_company",
    "where t.company_id=p_company and smartvolt_private.member_brand_allowed(p_company,p_actor,c.brand_id)",
  ],
]);
for (const name of ["sv_ops_attention"]) {
  const aliases = ["i", "f"];
  const s = latest.get(name);
  const replacements = [];
  for (const alias of aliases) {
    const from = `${alias}.company_id=p_company`;
    if (s.includes(from))
      replacements.push([
        from,
        `${from} and smartvolt_private.member_brand_allowed(p_company,p_actor,${alias}.brand_id)`,
        null,
      ]);
  }
  edit(name, replacements);
}
edit("sv_read_pos_ledger", [
  [
    "-- The date range",
    "if not smartvolt_private.member_has_product(p_company,p_actor,'pos')then raise exception 'product_not_purchased';end if;\n -- The date range",
  ],
  [
    "o.company_id=p_company and (p_brand",
    "o.company_id=p_company and smartvolt_private.member_brand_allowed(p_company,p_actor,o.brand_id)and (p_brand",
  ],
]);
edit("sv_commit_workspace", [
  [
    "select * into doc from",
    "perform public.sv_authorize(p_company,p_actor,case when p_kind='customer-create'then null when p_kind in('pos','pos-admin')then 'pos'else 'crm'end,true);\n select * into doc from",
  ],
  [
    "if p_payload->'scope'",
    "if smartvolt_private.protected_workspace(p_company,p_actor,p_payload)is distinct from smartvolt_private.protected_workspace(p_company,p_actor,doc.payload)then raise exception 'brand_scope';end if;\n if exists(select 1 from jsonb_array_elements(p_payload#>'{inbox,conversations}')n where n->>'owner'is not null and not exists(select 1 from jsonb_array_elements(doc.payload#>'{inbox,conversations}')o where o->>'id'=n->>'id'and o->'owner'=n->'owner')and(not smartvolt_private.member_has_product(p_company,(n->>'owner')::uuid,'crm')or not smartvolt_private.member_brand_allowed(p_company,(n->>'owner')::uuid,n->>'brandId')))then raise exception 'assignee_invalid';end if;\n if exists(select 1 from jsonb_array_elements(coalesce(p_payload#>'{pos,appointments}','[]'))n where n->>'staffId'is not null and not exists(select 1 from jsonb_array_elements(coalesce(doc.payload#>'{pos,appointments}','[]'))o where o->>'id'=n->>'id'and o->'staffId'=n->'staffId'and o->'brandId'=n->'brandId')and(not smartvolt_private.member_has_product(p_company,(n->>'staffId')::uuid,'pos')or not smartvolt_private.member_brand_allowed(p_company,(n->>'staffId')::uuid,n->>'brandId')))then raise exception 'assignee_invalid';end if;\n if p_payload->'scope'",
  ],
]);
edit("ops_assign", [
  [
    "and m.role<>'viewer'",
    "and m.role<>'viewer'and smartvolt_private.member_has_product(p_company,m.user_id,'crm')and smartvolt_private.member_brand_allowed(p_company,m.user_id,t.brand_id)",
    2,
  ],
]);
for (const name of ["sv_meta_manage_thread", "sv_wa_manage_thread"]) {
  // Each manual assignee also needs the destination brand, not just an active company membership.
  const index = output.findIndex((sql) =>
    sql.startsWith("create or replace function public." + name + "("),
  );
  const marker = "assignee=(p_data->>" + "'assignee_id'" + ")::uuid;";
  if (!output[index]?.includes(marker)) throw Error("assignee anchor missing");
  output[index] = output[index].replace(
    marker,
    marker +
      "if assignee is not null and(not smartvolt_private.member_has_product(p_company,assignee,'crm')or not smartvolt_private.member_brand_allowed(p_company,assignee,(select brand_id from public.sv_customer_threads where company_id=p_company and thread_id=p_thread and provider='" +
      (name === "sv_wa_manage_thread" ? "whatsapp" : "meta") +
      "')))then raise exception 'customer_assignee_invalid';end if;",
  );
}
for (const name of [
  "sv_ai_finish",
  "sv_translation_finish",
  "sv_copilot_finish",
])
  edit(name, [
    [
      "if r.status<>'running'",
      check("r.brand_id", "r.product") + "if r.status<>'running'",
    ],
  ]);
// Current authority is rechecked before exposing prior model output or replaying a tool.
edit("sv_copilot_receipt", [
  [
    "if r.status='running'",
    `${check("r.brand_id", "p_product")}if not smartvolt_private.copilot_thread_allowed(p_company,p_actor,r.source_id::uuid)then raise exception 'brand_scope';end if;\n if r.status='running'`,
  ],
]);
guardAfterAuth(
  "sv_copilot_claim",
  "perform public.sv_copilot_authorize(p_company,p_actor,p_product,true);",
  `${check("p_brand", "p_product")}if exists(select 1 from public.sv_copilot_threads where company_id=p_company and id=p_thread)and not smartvolt_private.copilot_thread_allowed(p_company,p_actor,p_thread)then raise exception 'brand_scope';end if;`,
);
edit("sv_copilot_memory", [
  [
    "t.product=p_product and strpos",
    "t.product=p_product and smartvolt_private.copilot_thread_allowed(p_company,p_actor,t.id)and strpos",
  ],
  [
    "b.actor_id=p_actor and strpos",
    "b.actor_id=p_actor and smartvolt_private.member_brand_allowed(p_company,p_actor,b.brand_id)and strpos",
  ],
]);
edit("sv_copilot_action", [
  ["if b.revision<>", `${check("b.brand_id")}if b.revision<>`],
  ["if r.result->'campaign'", `${check("r.brand_id")}if r.result->'campaign'`],
]);
const header = readFileSync(
  new URL("./abc-scope-header.sql", import.meta.url),
  "utf8",
);
writeFileSync(
  new URL("20261114154839_convelta_abc_scoped_operations.sql", directory),
  `${header}\n-- Generated explicit overrides; source anchors verified by scripts/build-abc-scopes.mjs.\n${output.join("\n\n")}\n`,
);
