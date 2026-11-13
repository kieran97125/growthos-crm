export type Point = { x: number; y: number };
export type Frame = {
  left: number;
  top: number;
  width: number;
  height: number;
};
export type Insets = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
export type FloatingBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  size: number;
};
const limit = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

export function floatingBounds(
  frame: Frame,
  size: number,
  inset: Insets,
): FloatingBounds {
  const right = Math.max(
    frame.left,
    frame.left + frame.width - inset.right - size,
  );
  const bottom = Math.max(
    frame.top,
    frame.top + frame.height - inset.bottom - size,
  );
  return {
    left: Math.min(frame.left + inset.left, right),
    top: Math.min(frame.top + inset.top, bottom),
    right,
    bottom,
    size,
  };
}
export function clampPosition(p: Point, b: FloatingBounds): Point {
  return { x: limit(p.x, b.left, b.right), y: limit(p.y, b.top, b.bottom) };
}
export function restorePosition(p: Point | null, b: FloatingBounds): Point {
  return p
    ? {
        x: b.left + p.x * (b.right - b.left),
        y: b.top + p.y * (b.bottom - b.top),
      }
    : { x: b.right, y: b.bottom };
}
export function relativePosition(p: Point, b: FloatingBounds): Point {
  const q = clampPosition(p, b);
  return {
    x: (q.x - b.left) / (b.right - b.left || 1),
    y: (q.y - b.top) / (b.bottom - b.top || 1),
  };
}
export function snapPosition(p: Point, b: FloatingBounds): Point {
  const q = clampPosition(p, b),
    snap = (n: number, min: number, max: number) =>
      Math.min(n - min, max - n) < 18 ? (n - min <= max - n ? min : max) : n;
  return { x: snap(q.x, b.left, b.right), y: snap(q.y, b.top, b.bottom) };
}
export function readPosition(raw: string | null): Point | null {
  try {
    if (!raw || raw.length > 120) return null;
    const p: unknown = JSON.parse(raw);
    if (!p || typeof p !== "object" || !("x" in p) || !("y" in p)) return null;
    return typeof p.x === "number" &&
      Number.isFinite(p.x) &&
      p.x >= 0 &&
      p.x <= 1 &&
      typeof p.y === "number" &&
      Number.isFinite(p.y) &&
      p.y >= 0 &&
      p.y <= 1
      ? { x: p.x, y: p.y }
      : null;
  } catch {
    return null;
  }
}
export function companionPlacement(
  p: Point,
  b: FloatingBounds,
  f: Frame,
  mobile: boolean,
  bottom: number,
  peekHeight: number,
) {
  const gutter = Math.max(
      mobile ? 10 : 24,
      b.left - f.left,
      f.left + f.width - b.right - b.size,
    ),
    gap = 16;
  const width = Math.min(488, f.width - gutter * 2);
  const top = f.top + Math.min(mobile ? 12 : 84, Math.max(12, f.height - 300));
  const height = Math.max(
    0,
    Math.min(
      f.top + f.height - bottom - top,
      Math.max(360, f.top + f.height - bottom - b.size - gap - top),
    ),
  );
  const onLeft = p.x + b.size / 2 < f.left + f.width / 2;
  const maxX = f.left + f.width - gutter - width;
  let x = limit(onLeft ? p.x : p.x + b.size - width, f.left + gutter, maxX);
  if (!mobile && p.y < top + height && p.y + b.size > top) {
    const beside = onLeft ? p.x + b.size + gap : p.x - gap - width;
    if (beside >= f.left + gutter && beside <= maxX) x = beside;
  }
  const peekWidth = Math.min(330, f.width - 32);
  const peekX = limit(
    onLeft ? p.x : p.x + b.size - peekWidth,
    f.left + 16,
    f.left + f.width - 16 - peekWidth,
  );
  const above = p.y - peekHeight - 12;
  const peekY = limit(
    above >= f.top + 12 ? above : p.y + b.size + 12,
    f.top + 12,
    Math.max(f.top + 12, f.top + f.height - bottom - peekHeight),
  );
  return { x, top, width, height, onLeft, peekX, peekY };
}
