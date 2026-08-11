"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SignInForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/my-tasks";
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/send-magic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), next }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error ?? "Something went wrong.");
      } else {
        setSent(true);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--bg)",
    }}>
      <div style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "16px",
        padding: "40px",
        width: "400px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "32px" }}>
          <div style={{
            width: "36px", height: "36px", borderRadius: "8px",
            background: "var(--accent)", display: "flex", alignItems: "center",
            justifyContent: "center", color: "white", fontSize: "18px", fontWeight: 700,
          }}>V</div>
          <span style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>ViBe PM</span>
        </div>

        {sent ? (
          <>
            <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
              Check your email
            </h1>
            <p style={{ fontSize: "14px", color: "var(--text-muted)", lineHeight: 1.6 }}>
              We sent a sign-in link to <strong>{email}</strong>. Click the link to continue.
            </p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
              Sign in
            </h1>
            <p style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "28px" }}>
              Enter your email and we&apos;ll send you a sign-in link.
            </p>
            <form onSubmit={submit}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  fontSize: "14px",
                  background: "var(--bg)",
                  color: "var(--text-primary)",
                  outline: "none",
                  marginBottom: "12px",
                  boxSizing: "border-box",
                }}
              />
              {error && (
                <p style={{ fontSize: "13px", color: "#dc3545", marginBottom: "10px" }}>{error}</p>
              )}
              <button
                type="submit"
                disabled={loading || !email.trim()}
                style={{
                  width: "100%",
                  padding: "11px 20px",
                  background: "var(--accent)",
                  color: "white",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "15px",
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading || !email.trim() ? 0.7 : 1,
                }}
              >
                {loading ? "Sending…" : "Send sign-in link"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
