import assert from "node:assert/strict";
import test from "node:test";
import {
  createStudioState,
  makeNode,
  studioReducer,
  studioSchema,
  type Flow,
} from "../src/components/crm/studio/model";
import {
  DEFAULT_SIMULATION,
  detectIntent,
  simulateFlow,
  suggestReply,
} from "../src/components/crm/studio/engine";
import { validateFlow } from "../src/components/crm/studio/engine";

const now = Date.UTC(2026, 10, 10, 5);
function setup() {
  const state = createStudioState();
  return {
    state,
    flow: state.flows[0],
    input: { ...DEFAULT_SIMULATION, fields: { ...DEFAULT_SIMULATION.fields } },
    botInput: {
      message: "舒緩護理幾錢？",
      name: "測試客戶",
      brandId: "nova-studio" as const,
      profile: state.bots[0],
      articles: state.articles,
      now,
      withinWindow: true,
      humanOwned: false,
      businessHours: true,
    },
  };
}
test("seed flows and scoped state are valid; corrupt persisted identities are rejected", () => {
  const { state } = setup();
  assert.equal(studioSchema.safeParse(state).success, true);
  state.flows.forEach((flow) => assert.deepEqual(validateFlow(flow), []));
  assert.equal(studioSchema.safeParse({ ...state, flows: [] }).success, false);
  assert.equal(studioSchema.safeParse({ ...state, bots: [] }).success, false);
  assert.equal(
    studioSchema.safeParse({ ...state, bots: [state.bots[0], state.bots[0]] })
      .success,
    false,
  );
  assert.equal(
    studioSchema.safeParse({
      ...state,
      articles: [{ ...state.articles[0], clientId: "other-client" }],
    }).success,
    false,
  );
});
test("graph rejects cycles, orphan nodes, dangling references and duplicate exits", () => {
  const { flow } = setup();
  assert.match(
    validateFlow({
      ...flow,
      edges: [
        ...flow.edges,
        { id: "cycle", source: "card", target: "start", sourceHandle: null },
      ],
    }).join(),
    /循環/,
  );
  assert.match(
    validateFlow({
      ...flow,
      nodes: [...flow.nodes, makeNode("end", "orphan", 0, 0)],
    }).join(),
    /未接入/,
  );
  assert.match(
    validateFlow({
      ...flow,
      edges: [
        ...flow.edges,
        {
          id: "dangling",
          source: "card",
          target: "missing",
          sourceHandle: null,
        },
      ],
    }).join(),
    /不存在/,
  );
  assert.match(
    validateFlow({
      ...flow,
      edges: [
        ...flow.edges,
        {
          id: "duplicate",
          source: "intent",
          target: "human",
          sourceHandle: "booking",
        },
      ],
    }).join(),
    /同一出口/,
  );
});
test("graph rejects incorrect branch handles and outgoing links from terminal nodes", () => {
  const { flow } = setup();
  assert.match(
    validateFlow({
      ...flow,
      edges: flow.edges.map((e) =>
        e.sourceHandle === "booking" ? { ...e, sourceHandle: "typo" } : e,
      ),
    }).join(),
    /出口不適用/,
  );
  assert.match(
    validateFlow({
      ...flow,
      edges: [
        ...flow.edges,
        {
          id: "terminal",
          source: "remind",
          target: "human",
          sourceHandle: null,
        },
      ],
    }).join(),
    /出口不適用/,
  );
});
test("invalid graph cannot execute partial steps", () => {
  const { flow, input } = setup();
  const result = simulateFlow(
    { ...flow, nodes: [...flow.nodes, makeNode("trigger", "second", 0, 0)] },
    input,
  );
  assert.equal(result.steps.length, 0);
  assert.ok(result.issues.length);
});
test("new and existing customers both wait at actual CS review before any reminder", () => {
  const { flow, input } = setup();
  for (const customerType of ["new", "existing"] as const) {
    const result = simulateFlow(flow, { ...input, customerType });
    assert.equal(result.followup, true);
    assert.equal(result.steps.at(-1)?.nodeId, "review");
    assert.equal(result.steps.at(-1)?.state, "waiting");
    assert.equal(
      result.steps.some((s) => s.nodeId === "remind"),
      false,
    );
  }
});
test("verified reminder renders all mapped fields and remains a simulation outside the window", () => {
  const { flow, input } = setup();
  const result = simulateFlow(flow, {
    ...input,
    manualVerified: true,
    withinWindow: false,
  });
  const last = result.steps.at(-1)!;
  assert.equal(last.nodeId, "remind");
  assert.equal(last.state, "completed");
  for (const value of Object.values(input.fields))
    assert.ok(last.preview?.includes(value));
  assert.doesNotMatch(last.preview!, /\{\{/);
  assert.match(last.detail, /香港時間.*未發送/);
});
test("reminder blocks missing consent, unapproved templates and empty variables", () => {
  const { flow, input } = setup();
  const verified = { ...input, manualVerified: true };
  const consent = simulateFlow(flow, { ...verified, consent: false });
  assert.match(consent.steps.at(-1)!.detail, /同意/);
  const unapproved = simulateFlow(flow, {
    ...verified,
    templateApproved: false,
  });
  assert.match(unapproved.steps.at(-1)!.detail, /未獲批/);
  const empty = simulateFlow(flow, {
    ...verified,
    fields: { ...input.fields, date: " " },
  });
  assert.match(empty.steps.at(-1)!.detail, /缺少變數/);
  for (const r of [consent, unapproved, empty]) {
    assert.equal(r.steps.at(-1)!.state, "blocked");
    assert.equal(r.steps.at(-1)!.preview, undefined);
  }
});
test("edited routes are executed; removing review cannot bypass verification", () => {
  const { flow, input } = setup();
  const rerouted: Flow = {
    ...flow,
    nodes: flow.nodes.filter((n) => n.id !== "review"),
    edges: flow.edges
      .filter((e) => e.source !== "review")
      .map((e) => (e.target === "review" ? { ...e, target: "remind" } : e)),
  };
  assert.deepEqual(validateFlow(rerouted), []);
  const result = simulateFlow(rerouted, { ...input, manualVerified: true });
  assert.match(result.steps.at(-1)!.detail, /尚未通過 CS/);
  assert.equal(result.steps.at(-1)!.state, "blocked");
});
test("changing an actual intent edge changes the simulation route", () => {
  const { flow, input } = setup();
  const modified = {
    ...flow,
    edges: flow.edges.map((e) =>
      e.source === "intent" && e.sourceHandle === "booking"
        ? { ...e, target: "human" }
        : e.source === "intent" && e.sourceHandle === "handoff"
          ? { ...e, target: "intake" }
          : e,
    ),
  };
  const result = simulateFlow(modified, input);
  assert.equal(result.steps.at(-1)?.nodeId, "human");
  assert.equal(result.followup, false);
});
test("knowledge and fixed freeform nodes are blocked outside the service window", () => {
  const { flow, input } = setup();
  const answer = simulateFlow(flow, {
    ...input,
    intent: "faq",
    withinWindow: false,
  });
  assert.equal(answer.steps.at(-1)?.state, "blocked");
  const fixed = {
    ...flow,
    nodes: flow.nodes
      .map((n) => (n.id === "faq" ? { ...n, kind: "message" as const } : n))
      .concat(makeNode("end", "end", 0, 0)),
    edges: [
      ...flow.edges,
      { id: "done", source: "faq", target: "end", sourceHandle: null },
    ],
  };
  const result = simulateFlow(fixed, {
    ...input,
    intent: "faq",
    withinWindow: false,
  });
  assert.equal(result.steps.at(-1)?.state, "blocked");
  assert.equal(
    result.steps.some((s) => s.nodeId === "end"),
    false,
  );
});
test("unmapped template placeholders prevent simulation", () => {
  const { flow, input } = setup();
  const modified = {
    ...flow,
    nodes: flow.nodes.map((n) =>
      n.kind === "reminder"
        ? {
            ...n,
            config: {
              ...n.config,
              template: n.config.template + " {{unknown}}",
            },
          }
        : n,
    ),
  };
  assert.match(validateFlow(modified).join(), /未配對/);
  assert.equal(simulateFlow(modified, input).steps.length, 0);
});
test("new/existing condition follows each actual branch", () => {
  const { flow, input } = setup();
  const modified: Flow = {
    ...flow,
    nodes: [
      makeNode("trigger", "start", 0, 0),
      makeNode("condition", "type", 0, 0),
      makeNode("end", "new-end", 0, 0),
      makeNode("end", "existing-end", 0, 0),
    ],
    edges: [
      { id: "t", source: "start", target: "type", sourceHandle: null },
      { id: "n", source: "type", target: "new-end", sourceHandle: "new" },
      {
        id: "e",
        source: "type",
        target: "existing-end",
        sourceHandle: "existing",
      },
    ],
  };
  assert.equal(simulateFlow(modified, input).steps.at(-1)?.nodeId, "new-end");
  assert.equal(
    simulateFlow(modified, { ...input, customerType: "existing" }).steps.at(-1)
      ?.nodeId,
    "existing-end",
  );
});
test("assist cites approved same-brand knowledge revision without auto sending", () => {
  const { botInput } = setup();
  const result = suggestReply(botInput);
  assert.equal(result.decision, "draft");
  assert.match(result.reply, /480/);
  assert.equal(result.sources[0].id, "nova-studio-service");
  assert.equal(result.sources[0].revision, 1);
});
test("draft, expired and other-brand articles cannot supply answers", () => {
  const { botInput } = setup();
  const article = botInput.articles[0];
  for (const override of [
    { status: "draft" as const },
    { validUntil: "2026-11-09" },
    { brandId: "nova-care" as const },
  ]) {
    const result = suggestReply({
      ...botInput,
      articles: [{ ...article, ...override }],
    });
    assert.equal(result.decision, "handoff");
    assert.equal(result.sources.length, 0);
    assert.doesNotMatch(result.reply, /480/);
  }
});
test("brand-profile mismatch and service window are hard gates", () => {
  const { state, botInput } = setup();
  assert.equal(
    suggestReply({ ...botInput, profile: state.bots[1] }).decision,
    "blocked",
  );
  assert.equal(
    suggestReply({ ...botInput, withinWindow: false, assist: true }).decision,
    "blocked",
  );
});
test("bounded mode simulates automatic FAQ replies only within its authorized topics", () => {
  const { botInput } = setup();
  const profile = { ...botInput.profile, mode: "bounded" as const };
  assert.equal(suggestReply({ ...botInput, profile }).decision, "auto-demo");
  assert.equal(
    suggestReply({ ...botInput, profile: { ...profile, allowService: false } })
      .decision,
    "handoff",
  );
  assert.equal(
    suggestReply({ ...botInput, profile, assist: true }).decision,
    "draft",
  );
});
test("after-hours mode respects the business-hours test condition", () => {
  const { botInput } = setup();
  const profile = { ...botInput.profile, mode: "afterhours" as const };
  assert.equal(
    suggestReply({ ...botInput, profile, businessHours: true }).decision,
    "draft",
  );
  assert.equal(
    suggestReply({ ...botInput, profile, businessHours: false }).decision,
    "auto-demo",
  );
});
test("human ownership pauses automated replies while staff can request a draft", () => {
  const { botInput } = setup();
  const profile = { ...botInput.profile, mode: "bounded" as const };
  const result = suggestReply({ ...botInput, profile, humanOwned: true });
  assert.equal(result.decision, "blocked");
  assert.equal(result.reply, "");
  assert.equal(
    suggestReply({ ...botInput, profile, humanOwned: true, assist: true })
      .decision,
    "draft",
  );
});
test("booking intent collects information and never claims availability or confirmation", () => {
  const { botInput } = setup();
  const result = suggestReply({
    ...botInput,
    message: "星期六有冇位可以預約？",
    profile: { ...botInput.profile, mode: "bounded" },
  });
  assert.equal(result.intent, "booking");
  assert.equal(result.decision, "draft");
  assert.match(result.reply, /核實後再確認/);
  assert.equal(result.missing.length, 3);
  assert.equal(result.sources.length, 0);
});
test("complaints, human requests and unsupported questions hand off", () => {
  const { botInput } = setup();
  assert.equal(detectIntent("我想投訴同退款"), "handoff");
  for (const message of ["我想搵真人", "退款", "有個知識庫冇講嘅問題"]) {
    assert.equal(suggestReply({ ...botInput, message }).decision, "handoff");
  }
});
test("updated approved content and revision are immediately reflected in the answer", () => {
  const { state, botInput } = setup();
  const article = {
    ...state.articles[0],
    content: "已核實測試內容 HK$510。",
    revision: 2,
  };
  const next = studioReducer(state, { type: "article", article });
  const result = suggestReply({ ...botInput, articles: next.articles });
  assert.match(result.reply, /510/);
  assert.doesNotMatch(result.reply, /480/);
  assert.equal(result.sources[0].revision, 2);
  assert.equal(state.articles[0].revision, 1);
});
test("versions are immutable and restore without altering other flows", () => {
  const { state, flow } = setup();
  const saved = studioReducer(state, {
    type: "save-version",
    flowId: flow.id,
    id: "v1",
    at: now,
  });
  const edited = studioReducer(saved, {
    type: "flow",
    flow: { ...saved.flows[0], name: "修改流程" },
  });
  assert.equal(edited.versions[0].flow.name, flow.name);
  const restored = studioReducer(edited, {
    type: "restore-version",
    versionId: "v1",
    at: now + 1,
  });
  assert.equal(restored.flows[0].name, flow.name);
  assert.equal(restored.flows[0].revision, 3);
  assert.deepEqual(restored.flows[1], state.flows[1]);
});
test("cross-brand knowledge moves and invalid hours are rejected", () => {
  const { state } = setup();
  assert.equal(
    studioReducer(state, {
      type: "article",
      article: { ...state.articles[0], brandId: "nova-care" },
    }),
    state,
  );
  assert.equal(
    studioReducer(state, {
      type: "bot",
      bot: { ...state.bots[0], openingHour: 22, closingHour: 8 },
    }),
    state,
  );
});
