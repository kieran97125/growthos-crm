import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTemplate,
  fetchTemplates,
  templateComponents,
  prepareTemplateDefinition,
} from "../src/lib/engagement/templates";
import { definitionSchema } from "../src/lib/engagement/model";
import { sendTemplate } from "../src/lib/whatsapp/graph";
const official = {
  id: "90001",
  name: "appointment_reminder",
  language: "en",
  status: "APPROVED",
  category: "UTILITY",
  components: [
    {
      type: "BODY",
      text: "Hello {{1}}, your appointment is on {{2}}.",
      example: { body_text: [["A", "B"]] },
    },
  ],
};
const credentials = {
  phoneNumberId: "90002",
  accessToken: "synthetic_access_token_123456789",
};
test("official fingerprints change on material status/content/locale changes and exclude examples", () => {
  const a = normalizeTemplate(official);
  assert.equal(a.supported, true);
  assert.deepEqual(a.slots, [
    { component: "body", key: "1" },
    { component: "body", key: "2" },
  ]);
  assert.equal(
    a.fingerprint,
    normalizeTemplate({
      ...official,
      components: [
        {
          type: "BODY",
          text: official.components[0].text,
          example: { body_text: [["X", "Y"]] },
        },
      ],
    }).fingerprint,
  );
  for (const patch of [
    { status: "PAUSED" },
    { language: "zh_HK" },
    { components: [{ type: "BODY", text: "Changed" }] },
  ])
    assert.notEqual(
      a.fingerprint,
      normalizeTemplate({ ...official, ...patch }).fingerprint,
    );
});
test("media, interactive buttons and invalid positional variables remain unsupported", () => {
  for (const components of [
    [
      { type: "HEADER", format: "IMAGE" },
      { type: "BODY", text: "Hello" },
    ],
    [
      ...official.components,
      {
        type: "BUTTONS",
        buttons: [{ type: "URL", url: "https://example.invalid" }],
      },
    ],
    [{ type: "BODY", text: "Broken {{2}}" }],
  ])
    assert.equal(
      normalizeTemplate({ ...official, components }).supported,
      false,
    );
});
test("canonical template variables remain strict while the official body may contain placeholders", () => {
  const t = normalizeTemplate(official),
    d = definitionSchema.parse({
      kind: "template",
      body: t.body,
      name: t.name,
      locale: t.language,
      fingerprint: t.fingerprint,
      values: [
        { component: "body", key: "1", value: "{{name}}" },
        { component: "body", key: "2", value: "15 November" },
      ],
    });
  assert.equal(
    prepareTemplateDefinition(d, [t]).body,
    "Hello {{name}}, your appointment is on 15 November.",
  );
  assert.deepEqual(templateComponents(d, t), [
    {
      type: "body",
      parameters: [
        { type: "text", text: "{{name}}" },
        { type: "text", text: "15 November" },
      ],
    },
  ]);
  assert.throws(
    () => templateComponents({ ...d, values: d.values.slice(0, 1) }, t),
    /variables_invalid/,
  );
  assert.throws(
    () => templateComponents({ ...d, locale: "zh_HK" }, t),
    /template_changed/,
  );
  assert.equal(
    definitionSchema.safeParse({ kind: "text", body: "{{phone}}", values: [] })
      .success,
    false,
  );
});
test("named parameters use their exact approved names", () => {
  const t = normalizeTemplate({
      ...official,
      parameter_format: "NAMED",
      components: [{ type: "BODY", text: "Hello {{customer}}" }],
    }),
    d = definitionSchema.parse({
      kind: "template",
      body: t.body,
      name: t.name,
      locale: t.language,
      fingerprint: t.fingerprint,
      values: [{ component: "body", key: "customer", value: "Test" }],
    });
  assert.deepEqual(templateComponents(d, t), [
    {
      type: "body",
      parameters: [{ type: "text", text: "Test", parameter_name: "customer" }],
    },
  ]);
});
test("provider paging only reuses an opaque cursor on the fixed official host", async () => {
  const urls: string[] = [];
  const result = await fetchTemplates("90003", credentials, async (input) => {
    const url = new URL(String(input));
    urls.push(String(url));
    assert.equal(url.hostname, "graph.facebook.com");
    return Response.json(
      urls.length === 1
        ? {
            data: [official],
            paging: {
              next: "http://127.0.0.1/private",
              cursors: { after: "opaque-cursor" },
            },
          }
        : { data: [{ ...official, id: "90004", language: "zh_HK" }] },
    );
  });
  assert.equal(result.length, 2);
  assert.equal(urls.length, 2);
  assert.equal(new URL(urls[1]).searchParams.get("after"), "opaque-cursor");
});
test("an incomplete or looping inventory is rejected instead of publishing a partial list", async () => {
  let calls = 0;
  await assert.rejects(
    fetchTemplates("90003", credentials, async () => {
      calls++;
      return Response.json({
        data: [official],
        paging: { next: "https://graph.facebook.com/next" },
      });
    }),
    /cursor_invalid/,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    fetchTemplates("90003", credentials, async () =>
      Response.json({
        data: [],
        paging: {
          next: "https://graph.facebook.com/next",
          cursors: { after: "same" },
        },
      }),
    ),
    /cursor_invalid/,
  );
});
test("template POST retains provider acceptance and cannot turn a timeout into a second attempt", async () => {
  let calls = 0;
  const input = {
    ...credentials,
    to: {
      kind: "phone" as const,
      id: "85255550000",
      phone: "85255550000",
      bsuid: null,
      parentBsuid: null,
    },
    name: official.name,
    locale: "en",
    components: [],
    opaqueCallbackData: "11111111-1111-4111-8111-111111111111",
  };
  const r = await sendTemplate(input, async (url, init) => {
    calls++;
    assert.match(
      String(url),
      /^https:\/\/graph\.facebook\.com\/v\d+\.\d+\/90002\/messages$/,
    );
    const body = JSON.parse(String(init?.body));
    assert.equal(body.type, "template");
    assert.equal(body.template.language.code, "en");
    return Response.json({ messages: [{ id: "wamid.synthetic" }] });
  });
  assert.equal(r.ok, true);
  assert.equal(calls, 1);
  calls = 0;
  const unknown = await sendTemplate(input, async () => {
    calls++;
    throw Error("synthetic network timeout");
  });
  assert.equal(calls, 1);
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.disposition, "ambiguous");
});
