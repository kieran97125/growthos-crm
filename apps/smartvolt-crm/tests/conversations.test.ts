import assert from "node:assert/strict";
import test from "node:test";
import {
  createDemoState,
  demoReducer,
  fillReply,
  matchesQueue,
  selectConversations,
  stateSchema,
  type Action,
  type Message,
} from "../src/components/crm/conversations/model";

const now = Date.UTC(2026, 10, 9, 6);
const createMessage = (overrides: Partial<Message> = {}): Message => ({
  id: "new-message",
  conversationId: "c1",
  kind: "outgoing",
  body: "可以，我幫你確認空檔。",
  author: "Mia",
  at: now + 1000,
  replyTo: null,
  ...overrides,
});

test("synthetic workspace restores only complete same-client identities", () => {
  const state = createDemoState(now);
  assert.equal(stateSchema.safeParse(state).success, true);
  assert.equal(
    stateSchema.safeParse({
      ...state,
      contacts: [
        { ...state.contacts[0], clientId: "another-client" },
        ...state.contacts.slice(1),
      ],
    }).success,
    false,
  );
  assert.equal(
    stateSchema.safeParse({
      ...state,
      conversations: [
        { ...state.conversations[0], brandId: "another-brand" },
        ...state.conversations.slice(1),
      ],
    }).success,
    false,
  );
  assert.equal(
    stateSchema.safeParse({ ...state, contacts: state.contacts.slice(1) })
      .success,
    false,
  );
  assert.equal(
    stateSchema.safeParse({
      ...state,
      messages: [...state.messages, state.messages[0]],
    }).success,
    false,
  );
});
test("reply is immutable and changes only its conversation", () => {
  const state = createDemoState(now);
  const next = demoReducer(state, {
    type: "message",
    conversationId: "c1",
    message: createMessage(),
  });
  assert.equal(next.messages.length, state.messages.length + 1);
  assert.equal(state.conversations[0].unread, 2);
  assert.equal(next.conversations[0].unread, 0);
  assert.equal(next.conversations[0].updatedAt, now + 1000);
  assert.equal(next.conversations[1], state.conversations[1]);
  assert.equal(stateSchema.safeParse(next).success, true);
});
test("internal note never becomes an external reply or updates unread/customer preview time", () => {
  const state = createDemoState(now);
  const next = demoReducer(state, {
    type: "message",
    conversationId: "c1",
    message: createMessage({ kind: "note", body: "先確認同時段空檔" }),
  });
  assert.deepEqual(next.conversations, state.conversations);
  assert.equal(next.messages.at(-1)?.kind, "note");
});
test("duplicate, blank, oversized and cross-conversation messages are rejected", () => {
  const state = createDemoState(now);
  for (const message of [
    createMessage({ id: state.messages[0].id }),
    createMessage({ body: "  " }),
    createMessage({ body: "x".repeat(5001) }),
    createMessage({ conversationId: "c2" }),
    createMessage({ replyTo: "c2-1" }),
    createMessage({ kind: "event" }),
  ]) {
    assert.equal(
      demoReducer(state, { type: "message", conversationId: "c1", message }),
      state,
    );
  }
});
test("quoted replies reference only messages from the same conversation", () => {
  const state = createDemoState(now);
  const next = demoReducer(state, {
    type: "message",
    conversationId: "c1",
    message: createMessage({ replyTo: "c1-1" }),
  });
  assert.equal(next.messages.at(-1)?.replyTo, "c1-1");
  assert.equal(stateSchema.safeParse(next).success, true);
});
test("assignment changes queues while preserving audit history and contact identity", () => {
  const state = createDemoState(now);
  const next = demoReducer(state, {
    type: "assign",
    conversationId: "c1",
    owner: "me",
    at: now + 5000,
    eventId: "assignment",
  });
  assert.equal(matchesQueue(next.conversations[0], "mine", now), true);
  assert.equal(matchesQueue(next.conversations[0], "unassigned", now), false);
  assert.equal(next.messages.at(-1)?.kind, "event");
  assert.equal(next.contacts, state.contacts);
});
test("snoozed conversation returns to the inbox only at its due time", () => {
  const state = createDemoState(now);
  const next = demoReducer(state, {
    type: "status",
    conversationId: "c1",
    status: "snoozed",
    at: now,
    until: now + 3600000,
    eventId: "snooze",
  });
  assert.equal(matchesQueue(next.conversations[0], "all", now), false);
  assert.equal(matchesQueue(next.conversations[0], "snoozed", now), true);
  assert.equal(matchesQueue(next.conversations[0], "all", now + 3600000), true);
  assert.equal(
    matchesQueue(next.conversations[0], "snoozed", now + 3600000),
    false,
  );
});
test("new inbound message reopens a resolved conversation without deleting history", () => {
  const state = createDemoState(now);
  const resolved = demoReducer(state, {
    type: "status",
    conversationId: "c1",
    status: "resolved",
    at: now,
    eventId: "resolve",
  });
  assert.equal(matchesQueue(resolved.conversations[0], "resolved", now), true);
  const next = demoReducer(resolved, {
    type: "message",
    conversationId: "c1",
    message: createMessage({ kind: "incoming" }),
  });
  assert.equal(next.conversations[0].status, "open");
  assert.equal(next.conversations[0].unread, 1);
  assert.equal(next.messages.length, state.messages.length + 2);
});
test("reading one conversation does not cascade into other unread conversations", () => {
  const state = createDemoState(now);
  const next = demoReducer(state, { type: "read", conversationId: "c1" });
  const unread = selectConversations(next, {
    queue: "unread",
    brand: "all",
    channel: "all",
    query: "",
    now,
  });
  assert.deepEqual(
    unread.map((c) => c.id),
    ["c2", "c4"],
  );
});
test("search, brand, channel and queue use one intersected scope", () => {
  const state = createDemoState(now);
  const rows = selectConversations(state, {
    queue: "all",
    brand: "nova-care",
    channel: "messenger",
    query: "同事",
    now,
  });
  assert.deepEqual(
    rows.map((c) => c.id),
    ["c5"],
  );
  assert.equal(
    selectConversations(state, {
      queue: "all",
      brand: "nova-studio",
      channel: "messenger",
      query: "同事",
      now,
    }).length,
    0,
  );
});
test("customer confirmation never automatically confirms a booking", () => {
  const state = createDemoState(now);
  const next = demoReducer(state, {
    type: "booking",
    booking: { ...state.bookings[0], customerConfirmed: true },
    at: now,
    eventId: "booking-edit",
  });
  assert.equal(next.bookings[0].customerConfirmed, true);
  assert.equal(next.bookings[0].status, "pending");
  assert.equal(next.messages.at(-1)?.body, "預約意向已儲存，等候同事確認");
  assert.equal(
    demoReducer(state, {
      type: "booking",
      booking: { ...state.bookings[0], contactId: "p2" },
      at: now,
      eventId: "bad",
    }),
    state,
  );
});
test("cancelling a booking preserves the record rather than deleting its history", () => {
  const state = createDemoState(now);
  const next = demoReducer(state, {
    type: "booking",
    booking: { ...state.bookings[0], status: "cancelled" },
    at: now,
    eventId: "cancel",
  });
  assert.equal(next.bookings.length, 1);
  assert.equal(next.bookings[0].status, "cancelled");
  assert.match(next.messages.at(-1)?.body ?? "", /歷史記錄保留/);
});
test("quick replies use the selected contact and brand, not a previous conversation", () => {
  const state = createDemoState(now);
  assert.equal(
    fillReply(
      "{{name}}，你好！歡迎聯絡 {{brand}}。",
      state.contacts[4],
      state.conversations[4],
    ),
    "Jason Lee，你好！歡迎聯絡 Nova Care。",
  );
});
test("unknown identifiers are ignored", () => {
  const state = createDemoState(now);
  const action: Action = { type: "read", conversationId: "missing" };
  assert.equal(demoReducer(state, action), state);
});
