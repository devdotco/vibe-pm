"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MESSAGING_URL =
  process.env.NEXT_PUBLIC_MESSAGING_URL ?? "https://chat.vb.co";
const FINANCE_URL =
  process.env.NEXT_PUBLIC_FINANCE_URL ?? "https://finance.vb.co";
const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://marketing.vb.co";
const SHELL_URL =
  process.env.NEXT_PUBLIC_SHELL_URL ?? "https://app.vb.co";

function AppIcon({
  href,
  title,
  children,
  active,
  external,
}: {
  href: string;
  title: string;
  children: React.ReactNode;
  active?: boolean;
  external?: boolean;
}) {
  const style: React.CSSProperties = {
    width: "34px",
    height: "34px",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "16px",
    color: active ? "white" : "rgba(255,255,255,0.55)",
    background: active ? "var(--accent)" : "transparent",
    textDecoration: "none",
    transition: "background 0.1s, color 0.1s",
    cursor: "pointer",
    border: "none",
    flexShrink: 0,
  };

  if (external) {
    return (
      <a
        href={href}
        title={title}
        target="_blank"
        rel="noopener noreferrer"
        style={style}
        onMouseEnter={(e) => {
          if (!active) {
            (e.currentTarget as HTMLAnchorElement).style.background =
              "rgba(255,255,255,0.1)";
            (e.currentTarget as HTMLAnchorElement).style.color =
              "rgba(255,255,255,0.85)";
          }
        }}
        onMouseLeave={(e) => {
          if (!active) {
            (e.currentTarget as HTMLAnchorElement).style.background =
              "transparent";
            (e.currentTarget as HTMLAnchorElement).style.color =
              "rgba(255,255,255,0.55)";
          }
        }}
      >
        {children}
      </a>
    );
  }

  return (
    <Link
      href={href}
      title={title}
      style={style}
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLAnchorElement).style.background =
            "rgba(255,255,255,0.1)";
          (e.currentTarget as HTMLAnchorElement).style.color =
            "rgba(255,255,255,0.85)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLAnchorElement).style.background =
            "transparent";
          (e.currentTarget as HTMLAnchorElement).style.color =
            "rgba(255,255,255,0.55)";
        }
      }}
    >
      {children}
    </Link>
  );
}

export function AppSwitcher() {
  const pathname = usePathname();
  const isPM = true; // we are in vibe-pm
  const _ = pathname; // suppress unused warning

  return (
    <div
      style={{
        width: "44px",
        flexShrink: 0,
        background: "#13141e",
        borderRight: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "10px 0",
        gap: "4px",
        height: "100%",
      }}
    >
      {/* ViBe logo */}
      <div
        style={{
          width: "34px",
          height: "34px",
          borderRadius: "8px",
          background: "var(--accent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "15px",
          fontWeight: 700,
          color: "white",
          marginBottom: "8px",
          flexShrink: 0,
        }}
        title="ViBe"
      >
        V
      </div>

      {/* Divider */}
      <div
        style={{
          width: "20px",
          height: "1px",
          background: "rgba(255,255,255,0.08)",
          marginBottom: "4px",
        }}
      />

      {/* PM */}
      <AppIcon href="/home" title="ViBe PM" active={isPM}>
        ✓
      </AppIcon>

      {/* Messaging */}
      <AppIcon href={MESSAGING_URL} title="ViBe Messaging" external>
        💬
      </AppIcon>

      {/* Finance */}
      <AppIcon href={FINANCE_URL} title="ViBe Finance" external>
        $
      </AppIcon>

      {/* Marketing */}
      <AppIcon href={MARKETING_URL} title="ViBe Marketing" external>
        ⚡
      </AppIcon>

      {/* App shell */}
      <AppIcon href={SHELL_URL} title="ViBe Home" external>
        ⌂
      </AppIcon>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Divider */}
      <div
        style={{
          width: "20px",
          height: "1px",
          background: "rgba(255,255,255,0.08)",
          marginBottom: "4px",
        }}
      />

      {/* Notifications */}
      <AppIcon href="/inbox" title="Notifications">
        🔔
      </AppIcon>
    </div>
  );
}
