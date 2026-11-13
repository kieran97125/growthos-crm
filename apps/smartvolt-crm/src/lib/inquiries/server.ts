import "server-only";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { loadCompany, requireCompany } from "@/lib/saas/server";
import { requireProduct } from "@/lib/saas/products";
import { AccessError } from "@/lib/saas/identity";
import { appSchema } from "@/lib/demo/state";
import { applyCompanyCommand } from "@/lib/saas/workspace";
import { actMeta, readMeta } from "@/lib/meta/server";
import {
  listMessages,
  sendMessage,
  conversationCommand,
} from "@/lib/whatsapp/server";
import {
  actionSchema,
  inboxQuery,
  inquirySchema,
  providerSchema,
  type InquiryDetail,
  type CustomerDetail,
  type BookingRequest,
  type Availability,
} from "./model";
const uuid = z.uuid();
function checked(error: { message?: string; code?: string } | null) {
  if (!error) return;
  if (
    /access_denied|product_required|product_not_purchased|brand_scope/.test(
      error.message ?? "",
    )
  )
    throw new AccessError("你無權使用此公司、品牌或產品。", 403);
  if (error.code === "P0002")
    throw new AccessError("找不到此客戶、對話或預約。", 404);
  if (
    /revision|idempotency|context_changed|booking_scope|pos_required/.test(
      error.message ?? "",
    ) ||
    error.code === "23505"
  )
    throw new AccessError(
      "資料已更新，請重新讀取後核對；原有操作記錄會保留。",
      409,
    );
  if (/invalid|required/.test(error.message ?? ""))
    throw new AccessError("資料不完整或未通過核對，改動未有儲存。", 400);
  throw new AccessError("暫時未能完成客戶交接，請稍後核對同一操作。", 503);
}
async function access(companyId: string, crm = true) {
  uuid.parse(companyId);
  const a = await requireCompany(companyId);
  if (crm) requireProduct(a.products, "crm");
  else if (!a.products.length) throw new AccessError("公司未有可使用產品。");
  return a;
}
const cursorSchema = z
  .object({
    at: z.iso.datetime({ offset: true }),
    key: z.string().min(1).max(100),
  })
  .strict();
export async function readInquiries(companyId: string, raw: unknown) {
  const a = await access(companyId),
    q = inboxQuery.parse(raw);
  let cursor: z.infer<typeof cursorSchema> | undefined;
  if (q.cursor) {
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(q.cursor)) throw new Error();
      cursor = cursorSchema.parse(
        JSON.parse(Buffer.from(q.cursor, "base64url").toString()),
      );
    } catch {
      throw new AccessError("分頁位置已失效，請重新查閱。", 400);
    }
  }
  const [rows, members, wa, meta, w] = await Promise.all([
    a.db.rpc("sv_inbox_list", {
      p_company: companyId,
      p_actor: a.user.id,
      p_queue: q.queue,
      p_channel: q.channel,
      p_search: q.search,
      p_before: cursor?.at ?? null,
      p_before_key: cursor?.key ?? null,
    }),
    a.db
      .from("sv_memberships")
      .select("user_id,display_name")
      .eq("company_id", companyId)
      .eq("status", "active")
      .neq("role", "viewer")
      .order("display_name"),
    a.db
      .from("sv_wa_connections")
      .select("display_phone,state")
      .eq("company_id", companyId),
    a.db
      .from("sv_meta_connections")
      .select("channel,label,enabled,last_inbound_at")
      .eq("company_id", companyId),
    a.db
      .from("sv_workspaces")
      .select("payload")
      .eq("company_id", companyId)
      .single(),
  ]);
  for (const r of [rows, members, wa, meta, w]) checked(r.error);
  const data = z
      .object({
        threads: z.array(inquirySchema),
        counts: z.record(z.string(), z.number()),
      })
      .parse(rows.data),
    page = data.threads.slice(0, 50),
    last = page.at(-1);
  return {
    threads: page,
    counts: data.counts,
    nextCursor:
      data.threads.length > 50 && last
        ? Buffer.from(
            JSON.stringify({ at: last.updated_at, key: last.key }),
          ).toString("base64url")
        : null,
    companyName: a.company.name,
    actorId: a.user.id,
    canEdit: a.actor.role !== "viewer",
    hasPos: a.products.includes("pos"),
    members: members.data ?? [],
    brands: z
      .array(z.object({ id: z.string(), name: z.string() }))
      .parse(w.data?.payload?.scope?.brands),
    connections: [
      ...(wa.data ?? []).map((c) => ({
        channel: "whatsapp",
        label: c.display_phone ?? "WhatsApp",
        state: c.state,
      })),
      ...(meta.data ?? []).map((c) => ({
        channel: c.channel,
        label: c.label,
        state: !c.enabled
          ? "disabled"
          : c.last_inbound_at
            ? "inbound-observed"
            : "configured",
      })),
    ],
  };
}
async function customerWith(
  a: Awaited<ReturnType<typeof access>>,
  id: string,
  before?: number,
): Promise<CustomerDetail> {
  z.string().min(1).max(100).parse(id);
  const [c, b, links, events, requests] = await Promise.all([
    a.db
      .from("sv_customers")
      .select("id,name,phone,email,tags,note,source,revision")
      .eq("company_id", a.company.id)
      .eq("id", id)
      .maybeSingle(),
    a.db
      .from("sv_customer_brands")
      .select("brand_id")
      .eq("company_id", a.company.id)
      .eq("customer_id", id),
    a.products.includes("crm")
      ? a.db
          .from("sv_customer_threads")
          .select("provider,thread_id,brand_id")
          .eq("company_id", a.company.id)
          .eq("customer_id", id)
      : Promise.resolve({ data: [], error: null }),
    a.db
      .from("sv_customer_events")
      .select("seq,kind,detail,created_at")
      .eq("company_id", a.company.id)
      .eq("customer_id", id)
      .lt("seq", before ?? Number.MAX_SAFE_INTEGER)
      .order("seq", { ascending: false })
      .limit(51),
    a.products.includes("crm")
      ? a.db
          .from("sv_booking_requests")
          .select("*")
          .eq("company_id", a.company.id)
          .eq("customer_id", id)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(21)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [c, b, links, events, requests]) checked(r.error);
  if (!c.data) throw new AccessError("找不到此公司客戶。", 404);
  const history = (events.data ?? []).filter((e) =>
    e.kind.startsWith("pos-")
      ? a.products.includes("pos")
      : a.products.includes("crm") || e.kind === "customer-updated",
  );
  const reqs = (requests.data ?? []).slice(0, 20) as BookingRequest[];
  if (a.products.includes("pos")) {
    const ids = reqs.flatMap((r) =>
      r.pos_appointment_id ? [r.pos_appointment_id] : [],
    );
    if (ids.length) {
      const ap = await a.db
        .from("sv_pos_appointments")
        .select("id,status,starts_at,snapshot")
        .eq("company_id", a.company.id)
        .in("id", ids);
      checked(ap.error);
      for (const r of reqs) {
        const row = ap.data?.find((p) => p.id === r.pos_appointment_id);
        r.appointment = row
          ? {
              status: row.status,
              startsAt: row.starts_at,
              serviceName: row.snapshot.serviceName,
            }
          : null;
      }
    }
  }
  return {
    customer: { ...c.data, brandIds: (b.data ?? []).map((x) => x.brand_id) },
    links: links.data ?? [],
    events: history
      .slice(0, 50)
      .map((e) => ({
        ...e,
        detail: e.kind.startsWith("pos-")
          ? Object.fromEntries(
              Object.entries(e.detail as Record<string, unknown>).filter(
                ([k]) =>
                  [
                    "amountCents",
                    "orderId",
                    "source",
                    "serviceName",
                    "startsAt",
                    "status",
                  ].includes(k),
              ),
            )
          : e.detail,
      })),
    nextEvent: (events.data?.length ?? 0) > 50 ? events.data![49].seq : null,
    requests: reqs,
    hasMoreRequests: (requests.data?.length ?? 0) > 20,
  };
}
export async function readCustomer(
  companyId: string,
  id: string,
  before?: string,
) {
  return customerWith(
    await access(companyId, false),
    id,
    before ? z.coerce.number().int().positive().parse(before) : undefined,
  );
}
export async function listCustomers(
  companyId: string,
  params: URLSearchParams,
) {
  const a = await access(companyId, false);
  const q = z
    .object({
      brand: z.string().max(100).nullable(),
      search: z.string().max(100),
      after: z.string().max(100).nullable(),
    })
    .parse({
      brand: params.get("brand"),
      search: params.get("search") ?? "",
      after: params.get("after"),
    });
  const r = await a.db.rpc("sv_customer_list", {
    p_company: companyId,
    p_actor: a.user.id,
    p_brand: q.brand,
    p_search: q.search,
    p_after: q.after,
  });
  checked(r.error);
  const rows = z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        phone: z.string(),
        revision: z.number(),
      }),
    )
    .parse(r.data);
  return {
    customers: rows.slice(0, 50),
    nextAfter: rows.length > 50 ? rows[49].id : null,
  };
}
export async function readInquiry(
  companyId: string,
  provider: unknown,
  threadId: string,
  before?: string,
): Promise<InquiryDetail> {
  const a = await access(companyId),
    p = providerSchema.parse(provider);
  uuid.parse(threadId);
  const link = await a.db
    .from("sv_customer_threads")
    .select("customer_id,brand_id,revision")
    .eq("company_id", companyId)
    .eq("provider", p)
    .eq("thread_id", threadId)
    .maybeSingle();
  checked(link.error);
  if (!link.data) throw new AccessError("找不到此公司對話。", 404);
  const customer = await customerWith(a, link.data.customer_id);
  let messages: InquiryDetail["messages"],
    nextBefore: number | null,
    thread: Record<string, unknown>,
    activity: InquiryDetail["activity"] = [],
    channel = "whatsapp";
  if (p === "meta") {
    const d = await readMeta(companyId, threadId, before);
    if (!d.thread || !d.messages)
      throw new AccessError("對話資料不完整。", 503);
    thread = d.thread;
    const connection = await a.db
      .from("sv_meta_connections")
      .select("channel")
      .eq("company_id", companyId)
      .eq("id", d.thread.connection_id)
      .single();
    checked(connection.error);
    channel = connection.data!.channel;
    messages = d.messages.map((m) => ({
      id: m.id,
      seq: m.seq,
      direction:
        m.direction === "inbound"
          ? "incoming"
          : m.direction === "outbound"
            ? "outgoing"
            : "note",
      body: m.body,
      state: m.state,
      at: m.provider_at ?? Date.parse(m.created_at),
      author: null,
    }));
    nextBefore = d.hasMore ? (d.messages[0]?.seq ?? null) : null;
    activity = d.activity ?? [];
  } else {
    const params = new URLSearchParams({ limit: "60" });
    if (before) params.set("before", before);
    const [d, t, act] = await Promise.all([
      listMessages(companyId, threadId, params),
      a.db
        .from("sv_wa_conversations")
        .select(
          "id,revision,last_inbound_at,status,customer_name,assignee_id,priority,follow_up_at,next_step,updated_at",
        )
        .eq("company_id", companyId)
        .eq("id", threadId)
        .single(),
      a.db
        .from("sv_wa_thread_activity")
        .select("command_id,actor_name,created_at,previous,next")
        .eq("company_id", companyId)
        .eq("thread_id", threadId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    checked(t.error);
    checked(act.error);
    thread = t.data!;
    messages = d.messages.map((m) => ({
      id: m.id,
      seq: m.seq,
      direction: m.direction,
      body: m.body,
      state: m.state,
      at: m.providerAt ?? Date.parse(m.createdAt),
      author: m.authorName,
    }));
    nextBefore = d.nextBefore;
    activity = act.data ?? [];
  }
  const row = inquirySchema.parse({
    ...thread,
    key: p + ":" + threadId,
    provider: p,
    id: threadId,
    channel,
    brand_id: link.data.brand_id,
    customer_id: link.data.customer_id,
    link_revision: link.data.revision,
    name: customer.customer.name,
    unread_count: 0,
    preview: "",
    updated_at: thread.updated_at ?? new Date().toISOString(),
    assignee_active: true,
  });
  return { ...customer, thread: row, messages, nextBefore, activity };
}
async function bookingContext(companyId: string, requestId: string) {
  const a = await loadCompany(companyId, "pos");
  requireProduct(a.products, "crm");
  const r = await a.db
    .from("sv_booking_requests")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", uuid.parse(requestId))
    .single();
  checked(r.error);
  const request = r.data as BookingRequest;
  const c = await a.db.rpc("sv_customer_json", {
    p_company: companyId,
    p_id: request.customer_id,
  });
  checked(c.error);
  if (!c.data) throw new AccessError("客戶資料未能確認。", 409);
  const state = appSchema.parse({
    ...a.state,
    inbox: {
      ...a.state.inbox,
      contacts: [
        ...a.state.inbox.contacts.filter((x) => x.id !== request.customer_id),
        c.data,
      ],
    },
  });
  return { ...a, state, request };
}
export async function availability(
  companyId: string,
  params: URLSearchParams,
): Promise<Availability> {
  const q = z
    .object({
      requestId: z.uuid(),
      serviceId: z.string().max(100),
      at: z.coerce.number().int().nonnegative(),
    })
    .parse({
      requestId: params.get("requestId"),
      serviceId: params.get("serviceId") ?? "",
      at: params.get("at"),
    });
  const a = await bookingContext(companyId, q.requestId),
    services = a.state.pos!.catalog.filter(
      (s) =>
        s.brandId === a.request.brand_id && s.kind === "service" && s.active,
    );
  const service = services.find((s) => s.id === q.serviceId),
    choices: Availability["choices"] = [];
  const active = await a.db
    .from("sv_memberships")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("status", "active")
    .neq("role", "viewer");
  checked(active.error);
  if (service && a.request.status === "requested")
    for (const staff of a.scope.team.filter((s) =>
      active.data?.some((m) => m.user_id === s.id),
    ))
      for (const resource of service.resourceKind === "none"
        ? [null]
        : a.state.pos!.resources.filter(
            (r) =>
              r.brandId === a.request.brand_id &&
              r.kind === service.resourceKind &&
              r.active,
          )) {
        try {
          applyCompanyCommand(
            a.state,
            {
              type: "pos",
              command: {
                kind: "appointment-save",
                id: randomUUID(),
                appointmentId: "request-" + q.requestId,
                contactId: a.request.customer_id,
                serviceId: service.id,
                staffId: staff.id,
                resourceId: resource?.id ?? null,
                startsAt: q.at,
                guests: a.request.guests,
                status: "confirmed",
                note: a.request.note,
              },
            },
            a.actor,
            Date.now(),
            a.products,
          );
          choices.push({
            staffId: staff.id,
            staffName: staff.name,
            resourceId: resource?.id ?? null,
            resourceName: resource?.name ?? "毋須場地",
            startsAt: q.at,
          });
        } catch {
          /* Invalid combinations are unavailable; no mutation or model call. */
        }
      }
  return {
    revision: a.revision,
    requestRevision: a.request.revision,
    services: services.map(({ id, name, durationMinutes, priceCents }) => ({
      id,
      name,
      durationMinutes,
      priceCents,
    })),
    choices,
    blocker: !services.length
      ? "請先喺 POS 設定服務、資源及人員。"
      : !service
        ? null
        : !choices.length
          ? "此時段未有可用組合，請更改時間或核對 POS 資源。"
          : null,
  };
}
export async function actInquiry(companyId: string, raw: unknown) {
  const a = await access(companyId),
    c = actionSchema.parse(raw);
  if (a.actor.role === "viewer")
    throw new AccessError("你目前只有檢視權限。", 403);
  if (c.action === "booking-convert") {
    const req = {
      kind: "convert",
      request: c.requestId,
      revision: c.revision,
      requestRevision: c.requestRevision,
      selection: {
        serviceId: c.serviceId,
        staffId: c.staffId,
        resourceId: c.resourceId,
        startsAt: c.startsAt,
      },
    };
    const receipt = await a.db
      .from("sv_inquiry_commands")
      .select("actor_id,request,result")
      .eq("company_id", companyId)
      .eq("command_id", c.commandId)
      .maybeSingle();
    checked(receipt.error);
    if (receipt.data) {
      requireProduct(a.products, "pos");
      if (
        receipt.data.actor_id !== a.user.id ||
        !isDeepStrictEqual(receipt.data.request, req)
      )
        throw new AccessError("同一操作識別碼已用於另一項改動。", 409);
      return receipt.data.result;
    }
    const ctx = await bookingContext(companyId, c.requestId);
    if (ctx.actor.role === "viewer")
      throw new AccessError("你目前只有檢視權限。", 403);
    if (
      ctx.request.revision !== c.requestRevision ||
      ctx.request.status !== "requested"
    )
      throw new AccessError("預約意向已更新，請重新核對。", 409);
    const member = await a.db
      .from("sv_memberships")
      .select("role,status")
      .eq("company_id", companyId)
      .eq("user_id", c.staffId)
      .maybeSingle();
    checked(member.error);
    if (
      !member.data ||
      member.data.status !== "active" ||
      member.data.role === "viewer"
    )
      throw new AccessError("請選擇在職服務同事。", 409);
    const next = applyCompanyCommand(
      ctx.state,
      {
        type: "pos",
        command: {
          kind: "appointment-save",
          id: c.commandId,
          appointmentId: "request-" + c.requestId,
          contactId: ctx.request.customer_id,
          serviceId: c.serviceId,
          staffId: c.staffId,
          resourceId: c.resourceId,
          startsAt: c.startsAt,
          guests: ctx.request.guests,
          status: "confirmed",
          note: ctx.request.note,
        },
      },
      ctx.actor,
      Date.now(),
      ctx.products,
    );
    next.pos!.appointments.find(
      (p) => p.id === "request-" + c.requestId,
    )!.requestId = c.requestId;
    appSchema.parse(next);
    const r = await a.db.rpc("sv_commit_booking", {
      p_company: companyId,
      p_actor: a.user.id,
      p_command: c.commandId,
      p_request: c.requestId,
      p_expected: c.revision,
      p_request_revision: c.requestRevision,
      p_selection: req.selection,
      p_payload: next,
    });
    checked(r.error);
    return r.data;
  }
  if (c.action === "booking-confirm" || c.action === "booking-cancel") {
    const r = await a.db.rpc("sv_booking_request", {
      p_company: companyId,
      p_actor: a.user.id,
      p_command: c.commandId,
      p_id: c.requestId,
      p_action: c.action === "booking-confirm" ? "confirm" : "cancel",
      p_data: {},
      p_expected: c.revision,
    });
    checked(r.error);
    return r.data;
  }
  if (!("provider" in c)) throw new AccessError("操作格式不完整。", 400);
  // Every thread action must resolve an actual company-owned provider link.
  const link = await a.db
    .from("sv_customer_threads")
    .select("customer_id")
    .eq("company_id", companyId)
    .eq("provider", c.provider)
    .eq("thread_id", c.threadId)
    .maybeSingle();
  checked(link.error);
  if (!link.data) throw new AccessError("找不到此公司對話。", 404);
  if (c.action === "relink") {
    const r = await a.db.rpc("sv_customer_relink", {
      p_company: companyId,
      p_actor: a.user.id,
      p_provider: c.provider,
      p_thread: c.threadId,
      p_customer: c.customerId,
      p_expected: c.revision,
      p_command: c.commandId,
      p_reason: c.reason,
    });
    checked(r.error);
    return r.data;
  }
  if (c.action === "booking-create") {
    const r = await a.db.rpc("sv_booking_request", {
      p_company: companyId,
      p_actor: a.user.id,
      p_command: c.commandId,
      p_id: c.requestId,
      p_action: "create",
      p_data: {
        provider: c.provider,
        threadId: c.threadId,
        customerId: c.customerId,
        linkRevision: c.linkRevision,
        service: c.service,
        desiredAt: c.desiredAt,
        guests: c.guests,
        note: c.note,
      },
      p_expected: 0,
    });
    checked(r.error);
    return r.data;
  }
  if (c.action === "manage" || c.action === "auto-assign") {
    const r = await a.db.rpc(
      c.action === "auto-assign"
        ? "sv_inquiry_auto_assign"
        : c.provider === "meta"
          ? "sv_meta_manage_thread"
          : "sv_wa_manage_thread",
      {
        p_company: companyId,
        p_actor: a.user.id,
        ...(c.action === "auto-assign" ? { p_provider: c.provider } : {}),
        p_thread: c.threadId,
        p_command: c.commandId,
        p_expected: c.revision,
        ...(c.action === "manage" ? { p_data: c.data } : {}),
      },
    );
    checked(r.error);
    return r.data;
  }
  if (c.provider === "meta" && c.action === "note") {
    const r = await a.db.rpc("sv_inquiry_meta_note", {
      p_company: companyId,
      p_actor: a.user.id,
      p_thread: c.threadId,
      p_command: c.commandId,
      p_body: c.body,
    });
    checked(r.error);
    return r.data;
  }
  if (c.provider === "meta") {
    if (c.action === "send")
      return actMeta(companyId, {
        action: "send",
        threadId: c.threadId,
        clientId: c.commandId,
        revision: c.revision,
        body: c.body,
      });
    if (c.action === "read")
      return actMeta(companyId, {
        action: "read",
        threadId: c.threadId,
        through: c.through,
      });
    throw new AccessError("操作格式不完整。", 400);
  }
  if (c.action === "send")
    return sendMessage(companyId, c.threadId, {
      clientId: c.commandId,
      revision: c.revision,
      body: c.body,
      ...(c.replyTo ? { replyTo: c.replyTo } : {}),
    });
  return conversationCommand(companyId, c.threadId, {
    clientId: c.commandId,
    revision: c.revision,
    kind: c.action,
    ...(c.action === "note"
      ? { body: c.body }
      : { throughMessageId: c.messageId }),
  });
}
export async function updateCustomer(companyId: string, raw: unknown) {
  const a = await access(companyId, false),
    c = z
      .object({
        id: z.string().min(1).max(100),
        revision: z.number().int().nonnegative(),
        commandId: z.uuid(),
        data: z
          .object({
            name: z.string().trim().min(1).max(80),
            phone: z.string().max(40),
            email: z.union([z.email(), z.literal("")]),
            tags: z.array(z.string().trim().min(1).max(30)).max(20),
            note: z.string().max(12000),
          })
          .strict(),
      })
      .strict()
      .parse(raw);
  const r = await a.db.rpc("sv_customer_update", {
    p_company: companyId,
    p_actor: a.user.id,
    p_customer: c.id,
    p_expected: c.revision,
    p_command: c.commandId,
    p_data: c.data,
  });
  checked(r.error);
  return r.data;
}
