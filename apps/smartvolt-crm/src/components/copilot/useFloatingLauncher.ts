"use client";
import { useLayoutEffect, useRef } from "react";
import {
  clampPosition,
  companionPlacement,
  floatingBounds,
  readPosition,
  relativePosition,
  restorePosition,
  snapPosition,
  type Point,
} from "./floating-layout";

/** Presentation-only coordinates. Drag frames never update C's business context. */
export function useFloatingLauncher(scope: string, product: string) {
  const layerRef = useRef<HTMLDivElement>(null),
    launcherRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const layer = layerRef.current,
      button = launcherRef.current;
    if (!layer || !button) return;
    const workspace =
      layer.previousElementSibling instanceof HTMLElement &&
      layer.previousElementSibling.classList.contains("cq-workspace")
        ? layer.previousElementSibling
        : null;
    let frame = { left: 0, top: 0, width: innerWidth, height: innerHeight };
    let inset = { left: 24, top: 84, right: 24, bottom: 24 };
    let bounds = floatingBounds(frame, button.offsetWidth, inset);
    let point = restorePosition(null, bounds),
      saved: Point | null = null,
      storageKey = "";
    let raf = 0,
      suppressClick = false;
    let gesture: {
      id: number;
      x: number;
      y: number;
      origin: Point;
      moved: boolean;
      next: Point;
      threshold: number;
    } | null = null;
    const measure = () => {
      const v = window.visualViewport,
        css = getComputedStyle(layer);
      frame = {
        left: v?.offsetLeft ?? 0,
        top: v?.offsetTop ?? 0,
        width: v?.width ?? innerWidth,
        height: v?.height ?? innerHeight,
      };
      inset = {
        left: parseFloat(css.paddingLeft),
        top: parseFloat(css.paddingTop),
        right: parseFloat(css.paddingRight),
        bottom: parseFloat(css.paddingBottom),
      };
      bounds = floatingBounds(frame, button.offsetWidth, inset);
    };
    const apply = () => {
      point = clampPosition(point, bounds);
      const peek = layer.querySelector<HTMLElement>(".cc-peek");
      const p = companionPlacement(
        point,
        bounds,
        frame,
        innerWidth <= 760,
        inset.bottom,
        peek?.offsetHeight ?? 200,
      );
      for (const [name, value] of Object.entries({
        "fab-x": point.x,
        "fab-y": point.y,
        "panel-x": p.x,
        "panel-y": p.top,
        "panel-width": p.width,
        "panel-height": p.height,
        "peek-x": p.peekX,
        "peek-y": p.peekY,
      }))
        if (
          layer.style.getPropertyValue(`--cc-${name}`) !==
          `${Math.round(value)}px`
        )
          layer.style.setProperty(`--cc-${name}`, `${Math.round(value)}px`);
      workspace?.style.setProperty(
        "--cc-composer-clearance",
        innerWidth <= 760 &&
          point.x > frame.left + frame.width - 120 &&
          point.y + bounds.size > frame.top + frame.height - inset.bottom - 140
          ? "70px"
          : "0px",
      );
      layer.dataset.positioned = "true";
      layer.dataset.side = p.onLeft ? "left" : "right";
    };
    const persist = () => {
      saved = relativePosition(point, bounds);
      try {
        localStorage.setItem(storageKey, JSON.stringify(saved));
      } catch {
        /* Storage can be unavailable; moving still works. */
      }
    };
    const cancelFrame = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const cancel = () => {
      if (!gesture) return;
      cancelFrame();
      point = gesture.origin;
      suppressClick = gesture.moved;
      const id = gesture.id;
      gesture = null;
      delete layer.dataset.dragging;
      apply();
      if (button.hasPointerCapture(id)) button.releasePointerCapture(id);
    };
    const restore = () => {
      cancel();
      measure();
      storageKey = `convelta:c-position:v1:${scope}:${innerWidth <= 760 ? "mobile" : "desktop"}`;
      try {
        saved = readPosition(localStorage.getItem(storageKey));
      } catch {
        saved = null;
      }
      point = restorePosition(saved, bounds);
      apply();
    };
    const down = (e: PointerEvent) => {
      if (!e.isPrimary || e.button !== 0 || gesture) return;
      suppressClick = false;
      gesture = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        origin: { ...point },
        moved: false,
        next: { ...point },
        threshold: e.pointerType === "touch" ? 8 : 6,
      };
      button.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!gesture || gesture.id !== e.pointerId) return;
      const dx = e.clientX - gesture.x,
        dy = e.clientY - gesture.y;
      if (!gesture.moved && Math.hypot(dx, dy) < gesture.threshold) return;
      gesture.moved = true;
      layer.dataset.dragging = "true";
      gesture.next = clampPosition(
        { x: gesture.origin.x + dx, y: gesture.origin.y + dy },
        bounds,
      );
      e.preventDefault();
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          if (gesture) {
            point = gesture.next;
            apply();
          }
        });
    };
    const up = (e: PointerEvent) => {
      if (!gesture || gesture.id !== e.pointerId) return;
      cancelFrame();
      const ended = gesture;
      gesture = null;
      delete layer.dataset.dragging;
      if (ended.moved) {
        point = snapPosition(ended.next, bounds);
        apply();
        persist();
        suppressClick = true;
        e.preventDefault();
      }
      if (button.hasPointerCapture(e.pointerId))
        button.releasePointerCapture(e.pointerId);
    };
    const aborted = (e: PointerEvent) => {
      if (gesture?.id === e.pointerId) cancel();
    };
    const click = (e: MouseEvent) => {
      if (suppressClick && e.detail !== 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      suppressClick = false;
    };
    const key = (e: KeyboardEvent) => {
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      const step = e.shiftKey ? 48 : 16;
      const delta: Record<string, Point> = {
        ArrowLeft: { x: -step, y: 0 },
        ArrowRight: { x: step, y: 0 },
        ArrowUp: { x: 0, y: -step },
        ArrowDown: { x: 0, y: step },
      };
      if (e.key === "Home") {
        e.preventDefault();
        cancel();
        saved = null;
        try {
          localStorage.removeItem(storageKey);
        } catch {}
        point = restorePosition(null, bounds);
        apply();
      } else if (delta[e.key]) {
        e.preventDefault();
        cancel();
        point = clampPosition(
          { x: point.x + delta[e.key].x, y: point.y + delta[e.key].y },
          bounds,
        );
        apply();
        persist();
      }
    };
    const storage = (e: StorageEvent) => {
      if (!e.key || e.key === storageKey) restore();
    };
    const noMenu = (e: Event) => e.preventDefault();
    const observer = new ResizeObserver(() => apply());
    const children = new MutationObserver(() => {
      observer.disconnect();
      observer.observe(layer);
      const peek = layer.querySelector(".cc-peek");
      if (peek) observer.observe(peek);
      apply();
    });
    restore();
    observer.observe(layer);
    children.observe(layer, { childList: true });
    button.addEventListener("pointerdown", down);
    button.addEventListener("pointermove", move);
    button.addEventListener("pointerup", up);
    button.addEventListener("pointercancel", aborted);
    button.addEventListener("lostpointercapture", aborted);
    button.addEventListener("click", click, true);
    button.addEventListener("keydown", key);
    button.addEventListener("contextmenu", noMenu);
    window.addEventListener("resize", restore);
    window.visualViewport?.addEventListener("resize", restore);
    window.visualViewport?.addEventListener("scroll", restore);
    window.addEventListener("blur", cancel);
    window.addEventListener("storage", storage);
    return () => {
      workspace?.style.removeProperty("--cc-composer-clearance");
      cancelFrame();
      observer.disconnect();
      children.disconnect();
      button.removeEventListener("pointerdown", down);
      button.removeEventListener("pointermove", move);
      button.removeEventListener("pointerup", up);
      button.removeEventListener("pointercancel", aborted);
      button.removeEventListener("lostpointercapture", aborted);
      button.removeEventListener("click", click, true);
      button.removeEventListener("keydown", key);
      button.removeEventListener("contextmenu", noMenu);
      window.removeEventListener("resize", restore);
      window.visualViewport?.removeEventListener("resize", restore);
      window.visualViewport?.removeEventListener("scroll", restore);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("storage", storage);
    };
  }, [scope, product]);
  return { layerRef, launcherRef };
}
