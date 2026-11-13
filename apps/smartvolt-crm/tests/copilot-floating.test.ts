import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampPosition,
  companionPlacement,
  floatingBounds,
  readPosition,
  relativePosition,
  restorePosition,
  snapPosition,
} from "../src/components/copilot/floating-layout";

test("saved placement adapts to viewport and product clearance without leaving the visible frame", () => {
  const desktop = floatingBounds(
    { left: 0, top: 0, width: 1440, height: 1000 },
    62,
    { left: 24, right: 24, top: 84, bottom: 24 },
  );
  const preference = relativePosition({ x: 340, y: 300 }, desktop);
  for (const [width, height, bottom] of [
    [390, 844, 78],
    [390, 844, 142],
    [320, 240, 142],
    [844, 390, 24],
  ]) {
    const frame = { left: 0, top: 0, width, height };
    const b = floatingBounds(frame, 55, {
      left: 16,
      right: 16,
      top: 70,
      bottom,
    });
    const p = restorePosition(preference, b);
    assert.ok(p.x >= b.left && p.x <= b.right);
    assert.ok(p.y >= b.top && p.y <= b.bottom);
    assert.ok(p.x + b.size <= width && p.y + b.size <= height);
    assert.deepEqual(clampPosition({ x: -500, y: 99999 }, b), {
      x: b.left,
      y: b.bottom,
    });
  }
  const keyboard = floatingBounds(
    { left: 0, top: 200, width: 390, height: 380 },
    55,
    { left: 16, right: 16, top: 70, bottom: 78 },
  );
  const p = restorePosition(preference, keyboard);
  assert.ok(p.y >= 200 && p.y + 55 <= 580 - 78);
});
test("free placement is preserved, edge snapping is gentle, and zero-size travel is finite", () => {
  const b = { left: 16, top: 70, right: 319, bottom: 711, size: 55 };
  const free = { x: 150, y: 340 };
  assert.deepEqual(snapPosition(free, b), free);
  assert.deepEqual(snapPosition({ x: 20, y: 700 }, b), { x: 16, y: 711 });
  assert.deepEqual(restorePosition(relativePosition(free, b), b), free);
  const fixed = { ...b, right: 16, bottom: 70 };
  assert.deepEqual(relativePosition({ x: 30, y: 300 }, fixed), { x: 0, y: 0 });
});
test("corrupt or unbounded stored coordinates cannot move C outside its usable area", () => {
  for (const raw of [
    null,
    "{bad",
    "null",
    "[]",
    '{"x":-1,"y":0}',
    '{"x":1e400,"y":0}',
    '{"x":0,"y":2}',
    '{"x":"0.5","y":0}',
    "x".repeat(121),
  ])
    assert.equal(readPosition(raw), null);
  assert.deepEqual(readPosition('{"x":0.3,"y":1}'), { x: 0.3, y: 1 });
});
test("half-pixel touch coordinates retain the displayed pixel through repeated stored round trips", () => {
  const b = { left: 16, top: 70, right: 319, bottom: 711, size: 55 };
  let point = { x: 32.5, y: 232.5 };
  for (let n = 0; n < 50; n++) {
    const saved = readPosition(JSON.stringify(relativePosition(point, b)));
    assert.ok(saved);
    point = restorePosition(saved, b);
    assert.deepEqual(
      { x: Math.round(point.x), y: Math.round(point.y) },
      { x: 33, y: 233 },
    );
  }
});
test("companion follows the chosen side and remains inside desktop and portrait viewports", () => {
  for (const [width, height, mobile, floor] of [
    [1440, 1000, false, 24],
    [390, 844, true, 78],
    [844, 390, false, 24],
  ] as const) {
    const frame = { left: 0, top: 0, width, height };
    const b = floatingBounds(frame, mobile ? 55 : 62, {
      left: 16,
      right: 16,
      top: 70,
      bottom: floor,
    });
    for (const point of [
      { x: b.left, y: 170 },
      { x: b.right, y: b.bottom },
      { x: width / 2, y: 250 },
    ]) {
      const p = companionPlacement(
        clampPosition(point, b),
        b,
        frame,
        mobile,
        floor,
        200,
      );
      assert.ok(p.x >= 0 && p.x + p.width <= width);
      assert.ok(p.top >= 0 && p.top + p.height <= height - floor);
      assert.ok(p.peekX >= 0 && p.peekX + Math.min(330, width - 32) <= width);
      assert.ok(p.peekY >= 0 && p.peekY + 200 <= height - floor);
    }
  }
});
