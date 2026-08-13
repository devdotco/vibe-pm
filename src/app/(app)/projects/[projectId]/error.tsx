"use client";
import { useEffect } from "react";

export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[project-error]", error.message, error.stack);
  }, [error]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "16px", padding: "40px" }}>
      <div style={{ fontSize: "32px" }}>⚠️</div>
      <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>Something went wrong</div>
      <div style={{ fontSize: "13px", color: "var(--text-muted)", maxWidth: "480px", textAlign: "center", fontFamily: "monospace", background: "var(--bg-elevated)", padding: "12px", borderRadius: "8px", wordBreak: "break-word" }}>
        {error.message || "Unknown error"}
        {error.digest && <><br /><span style={{ opacity: 0.6 }}>digest: {error.digest}</span></>}
      </div>
      <button
        onClick={reset}
        style={{ padding: "8px 20px", background: "var(--accent)", color: "white", border: "none", borderRadius: "6px", fontSize: "14px", cursor: "pointer" }}
      >
        Retry
      </button>
    </div>
  );
}
