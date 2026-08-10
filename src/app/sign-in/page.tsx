import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  const { next } = await searchParams;
  if (user) redirect(next ?? "/my-tasks");

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
      }}
    >
      <div
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "16px",
          padding: "40px",
          width: "400px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "32px",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              background: "var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: "18px",
              fontWeight: 700,
            }}
          >
            V
          </div>
          <span style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>
            ViBe PM
          </span>
        </div>

        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
          Sign in to continue
        </h1>
        <p style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "28px" }}>
          Use your ViBe account to access project management.
        </p>

        <a
          href={`https://finance.vb.co/sign-in?next=${encodeURIComponent(
            `${process.env.NEXT_PUBLIC_APP_URL ?? "https://pm.vb.co"}${next ?? "/"}`
          )}`}
          style={{
            display: "block",
            textAlign: "center",
            padding: "12px 20px",
            background: "var(--accent)",
            color: "white",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "15px",
            fontWeight: 600,
          }}
        >
          Sign in with ViBe
        </a>

        <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "20px", textAlign: "center" }}>
          Your session is shared across all ViBe modules.
        </p>
      </div>
    </div>
  );
}
