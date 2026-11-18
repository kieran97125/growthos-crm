import { test } from "node:test";
import assert from "node:assert/strict";
import {
  effectiveNotificationPreferences,
  notificationPushState,
  type NotificationPage,
} from "../src/lib/notifications/model";
const legacy = {
  assignment: true,
  followup: true,
  sla: true,
  push: false,
  quietStart: 21,
  quietEnd: 9,
};
test("legacy categories default on without granting global push consent; explicit category off remains off", () => {
  assert.deepEqual(effectiveNotificationPreferences(legacy), {
    ...legacy,
    website: true,
    observation: true,
  });
  assert.equal(
    effectiveNotificationPreferences({ ...legacy, website: false }).website,
    false,
  );
  assert.equal(effectiveNotificationPreferences(legacy).push, false);
});
test("UI distinguishes a configured server, global opt-in and actual registered devices", () => {
  const p: Pick<
    NotificationPage,
    "preferences" | "pushConfigured" | "devices"
  > = {
    preferences: { revision: 0, data: legacy },
    pushConfigured: false,
    devices: [],
  };
  assert.equal(notificationPushState(p), "unconfigured");
  p.pushConfigured = true;
  assert.equal(notificationPushState(p), "off");
  p.preferences.data = { ...legacy, push: true };
  assert.equal(notificationPushState(p), "no_device");
  p.devices = [
    {
      id: "synthetic",
      active: false,
      label: "Synthetic",
      created_at: "2026-11-17T00:00:00Z",
    },
  ];
  assert.equal(notificationPushState(p), "no_device");
  p.devices[0].active = true;
  assert.equal(notificationPushState(p), "ready");
});
