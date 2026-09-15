"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Sign with a finger on site, or a mouse in the office. Pointer events cover
 * both, and `touch-action: none` stops a signing stroke from scrolling the page
 * on a phone — without it the pad is unusable exactly where it is used most.
 *
 * Exports a PNG with a transparent background so it sits on the report cleanly.
 */
export function SignaturePad({ onDone, onCancel, busy }: { onDone: (png: Blob) => void; onCancel: () => void; busy?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Back the canvas at device resolution so the line is not blurry on a phone.
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawing.current = true;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!dirty.current) { dirty.current = true; setHasInk(true); }
  };
  const end = () => { drawing.current = false; };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    dirty.current = false;
    setHasInk(false);
  };

  const save = () => {
    canvasRef.current?.toBlob((blob) => { if (blob) onDone(blob); }, "image/png");
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        style={{ width: "100%", height: 180, border: "1px dashed var(--border)", borderRadius: 8, background: "var(--bg)", touchAction: "none", cursor: "crosshair", display: "block" }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button onClick={clear} type="button" style={btn}>Clear</button>
        <button onClick={onCancel} type="button" style={btn}>Cancel</button>
        <button
          onClick={save}
          type="button"
          disabled={!hasInk || busy}
          style={{ ...btn, background: "var(--accent)", color: "white", border: "none", opacity: !hasInk || busy ? 0.6 : 1 }}
        >
          {busy ? "Saving…" : "Save signature"}
        </button>
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  padding: "8px 14px", border: "1px solid var(--border)", borderRadius: 6,
  background: "transparent", color: "var(--text-primary)", fontSize: 13.5, cursor: "pointer",
};
