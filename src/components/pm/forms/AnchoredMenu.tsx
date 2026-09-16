"use client";
import { useEffect, useLayoutEffect, useState } from "react";

/**
 * A menu that overlays everything.
 *
 * Absolutely-positioned menus inside a card get clipped by that card's
 * `overflow` (the Forms list rounds its corners, so the ⋯ menu was sliced in
 * half). This renders at `position: fixed` against the viewport, anchored to
 * the button's rect, so no ancestor can clip it — and it flips above the button
 * when there is no room below, which is what a row near the bottom of a long
 * list needs.
 *
 * Closes on outside click, Escape, scroll and resize: a fixed menu does not
 * follow its anchor, so it must not linger once the page moves under it.
 */
export function AnchoredMenu({
  anchor,
  onClose,
  width = 190,
  children,
}: {
  anchor: HTMLElement | null;
  onClose: () => void;
  width?: number;
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const margin = 8;
    const below = window.innerHeight - r.bottom - margin;
    const above = r.top - margin;
    const flip = below < 180 && above > below;
    setPos({
      top: flip ? Math.max(margin, r.top - Math.min(above, 320) - 4) : r.bottom + 4,
      left: Math.min(Math.max(margin, r.right - width), window.innerWidth - width - margin),
      maxHeight: Math.max(140, Math.min(flip ? above : below, 320)),
    });
  }, [anchor, width]);

  useEffect(() => {
    if (!anchor) return;
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  if (!anchor || !pos) return null;

  return (
    <>
      <div
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
        style={{ position: "fixed", inset: 0, zIndex: 2000 }}
      />
      <div
        role="menu"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: pos.top,
          left: pos.left,
          width,
          maxHeight: pos.maxHeight,
          overflowY: "auto",
          zIndex: 2001,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          boxShadow: "0 16px 40px rgba(0,0,0,0.22)",
          padding: 4,
        }}
      >
        {children}
      </div>
    </>
  );
}

export function MenuItem({
  children,
  onClick,
  danger,
  icon,
  checked,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  icon?: React.ReactNode;
  checked?: boolean;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left",
        padding: "9px 10px", background: checked ? "var(--accent-subtle, rgba(37,99,235,0.1))" : "none",
        border: "none", borderRadius: 6, fontSize: 13.5,
        color: danger ? "#ef4444" : "var(--text-primary)", cursor: "pointer",
      }}
    >
      {icon && <span style={{ display: "flex", color: "var(--text-muted)" }}>{icon}</span>}
      <span style={{ flex: 1 }}>{children}</span>
      {checked && <span style={{ color: "var(--accent)", fontSize: 12 }}>✓</span>}
    </button>
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "8px 10px 4px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3 }}>
      {children}
    </div>
  );
}
