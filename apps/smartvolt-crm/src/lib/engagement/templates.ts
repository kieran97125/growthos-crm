import { createHash } from "node:crypto";
import { z } from "zod";
import type { Template, MessageDefinition } from "./model";
import {
  DEFAULT_GRAPH_VERSION,
  type GraphCredentials,
} from "@/lib/whatsapp/graph";
const component = z
  .object({
    type: z.string(),
    format: z.string().optional(),
    text: z.string().max(10000).optional(),
  })
  .passthrough();
const official = z.object({
  id: z.string().regex(/^\d+$/),
  name: z.string().regex(/^[a-z0-9_]+$/),
  language: z.string().regex(/^[A-Za-z_]{2,20}$/),
  status: z.string(),
  category: z.string(),
  parameter_format: z.enum(["POSITIONAL", "NAMED"]).optional(),
  components: z.array(component).max(20),
});
export function normalizeTemplate(raw: unknown): Template {
  const t = official.parse(raw),
    slots: Template["slots"] = [];
  let supported = t.category !== "AUTHENTICATION";
  const components = t.components.map((c) => ({
    type: c.type,
    ...(c.format ? { format: c.format } : {}),
    ...(c.text !== undefined ? { text: c.text } : {}),
  }));
  if (t.components.filter((c) => c.type === "BODY").length !== 1)
    supported = false;
  for (const c of t.components) {
    if (
      !["HEADER", "BODY", "FOOTER"].includes(c.type) ||
      (c.type === "HEADER" && c.format !== "TEXT") ||
      !c.text
    ) {
      supported = false;
      continue;
    }
    const keys = [...c.text.matchAll(/{{([^{}]+)}}/g)].map((m) => m[1]);
    if (c.type === "FOOTER" && keys.length) supported = false;
    const unique = [...new Set(keys)];
    if (
      unique.some(
        (k) => !(/^[1-9]\d?$/.test(k) || /^[a-z][a-z0-9_]{0,29}$/.test(k)),
      )
    )
      supported = false;
    if (
      t.parameter_format !== "NAMED" &&
      unique.some((k, i) => k !== String(i + 1))
    )
      supported = false;
    if (t.parameter_format === "NAMED" && unique.some((k) => /^\d/.test(k)))
      supported = false;
    if (c.type === "HEADER" || c.type === "BODY")
      slots.push(
        ...unique.map((key) => ({
          component: c.type.toLowerCase() as "header" | "body",
          key,
        })),
      );
  }
  return {
    id: t.id,
    name: t.name,
    language: t.language,
    status: t.status,
    category: t.category,
    components,
    supported,
    slots,
    body: t.components
      .filter((c) => c.text)
      .map((c) => c.text)
      .join("\n"),
    fingerprint: createHash("sha256")
      .update(
        JSON.stringify({
          id: t.id,
          name: t.name,
          language: t.language,
          status: t.status,
          category: t.category,
          format: t.parameter_format ?? "POSITIONAL",
          components,
        }),
      )
      .digest("hex"),
  };
}
export async function boundedProviderJson(
  response: Response,
  max = 1048576,
): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > max) {
    await response.body?.cancel();
    throw new Error("provider_response_large");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("provider_empty");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const p = await reader.read();
      if (p.done) break;
      size += p.value.length;
      if (size > max) {
        await reader.cancel();
        throw new Error("provider_response_large");
      }
      chunks.push(p.value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
  );
}
/** Read all supported pages before publishing an inventory. Never follow provider URLs. */
export async function fetchTemplates(
  accountId: string,
  credentials: GraphCredentials,
  fetcher = fetch,
): Promise<Template[]> {
  if (
    !/^[1-9]\d{0,49}$/.test(accountId) ||
    !/^v\d+\.\d+$/.test(credentials.version ?? DEFAULT_GRAPH_VERSION)
  )
    throw new Error("invalid_account");
  const all: Template[] = [];
  let after: string | undefined;
  const seen = new Set<string>();
  for (let page = 0; page < 20; page++) {
    const url = new URL(
      `https://graph.facebook.com/${credentials.version ?? DEFAULT_GRAPH_VERSION}/${accountId}/message_templates`,
    );
    url.searchParams.set(
      "fields",
      "id,name,language,status,category,components,parameter_format",
    );
    url.searchParams.set("limit", "50");
    if (after) url.searchParams.set("after", after);
    const response = await fetcher(url, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
      signal: AbortSignal.timeout(15000),
      redirect: "error",
      cache: "no-store",
    });
    const raw = await boundedProviderJson(response);
    if (!response.ok) throw new Error("templates_unavailable");
    const p = z
      .object({
        data: z.array(z.unknown()).max(50),
        paging: z
          .object({
            next: z.string().optional(),
            cursors: z
              .object({ after: z.string().max(4000).optional() })
              .optional(),
          })
          .optional(),
      })
      .parse(raw);
    all.push(...p.data.map(normalizeTemplate));
    if (!p.paging?.next) return all;
    after = p.paging.cursors?.after;
    if (!after || seen.has(after)) throw new Error("templates_cursor_invalid");
    seen.add(after);
  }
  throw new Error("templates_inventory_limit");
}
export function templateComponents(
  definition: MessageDefinition,
  template: Template,
) {
  if (
    !template.supported ||
    template.status !== "APPROVED" ||
    template.fingerprint !== definition.fingerprint ||
    template.name !== definition.name ||
    template.language !== definition.locale
  )
    throw new Error("template_changed");
  if (
    template.slots.length !== definition.values.length ||
    template.slots.some(
      (s) =>
        !definition.values.some(
          (v) => v.component === s.component && v.key === s.key,
        ),
    )
  )
    throw new Error("template_variables_invalid");
  return (["header", "body"] as const).flatMap((component) => {
    const slots = template.slots.filter((s) => s.component === component);
    if (!slots.length) return [];
    return [
      {
        type: component,
        parameters: slots.map((s) => ({
          type: "text",
          text: definition.values.find(
            (v) => v.component === s.component && v.key === s.key,
          )!.value,
          ...(/^\d+$/.test(s.key) ? {} : { parameter_name: s.key }),
        })),
      },
    ];
  });
}
export function prepareTemplateDefinition(
  definition: MessageDefinition,
  inventory: Template[],
): MessageDefinition {
  if (definition.kind !== "template") return definition;
  const t = inventory.find((t) => t.fingerprint === definition.fingerprint);
  if (!t) throw new Error("template_changed");
  templateComponents(definition, t);
  return {
    ...definition,
    body: t.components
      .map((raw) => {
        const c = raw as { type: string; text?: string };
        return (c.text ?? "").replace(
          /{{([^{}]+)}}/g,
          (_, key) =>
            definition.values.find(
              (v) => v.component === c.type.toLowerCase() && v.key === key,
            )?.value ?? "",
        );
      })
      .filter(Boolean)
      .join("\n"),
  };
}
