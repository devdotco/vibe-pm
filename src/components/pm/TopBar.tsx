"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import type { User } from "@/lib/db/schema";

interface TopBarProps {
  user: User;
}

export function TopBar({ user }: TopBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchRef.current?.focus(), 50);
      }
      if (e.key === "Escape") setShowSearch(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      router.push(`/search?q=${encodeURIComponent(search.trim())}`);
      setShowSearch(false);
      setSearch("");
    }
  };

  const title = getPageTitle(pathname);

  return (
    <header
      style={{
        height: "56px",
        background: "var(--bg-elevated)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        padding: "0 20px",
        gap: "12px",
        flexShrink: 0,
      }}
    >
      <h1
        style={{
          fontSize: "16px",
          fontWeight: 600,
          color: "var(--text-primary)",
          flex: 1,
        }}
      >
        {title}
      </h1>

      {/* Search trigger */}
      <button
        onClick={() => { setShowSearch(true); setTimeout(() => searchRef.current?.focus(), 50); }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "6px 12px",
          border: "1px solid var(--border)",
          borderRadius: "6px",
          background: "var(--bg)",
          color: "var(--text-muted)",
          fontSize: "13px",
          cursor: "pointer",
          minWidth: "180px",
        }}
      >
        <span>🔍</span>
        <span>Search</span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: "11px",
            background: "var(--panel-hover)",
            padding: "1px 5px",
            borderRadius: "4px",
            border: "1px solid var(--border)",
          }}
        >
          ⌘K
        </span>
      </button>

      {/* New task quick button */}
      <a
        href="/tasks/new"
        style={{
          padding: "7px 14px",
          background: "var(--accent)",
          color: "white",
          borderRadius: "6px",
          fontSize: "13px",
          fontWeight: 500,
          textDecoration: "none",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <span style={{ fontSize: "16px", lineHeight: 1 }}>+</span>
        New Task
      </a>

      {/* Search modal */}
      {showSearch && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: "120px",
            zIndex: 1000,
          }}
          onClick={() => setShowSearch(false)}
        >
          <div
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              width: "520px",
              overflow: "hidden",
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={handleSearch}>
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tasks, projects, comments..."
                style={{
                  width: "100%",
                  padding: "16px 20px",
                  border: "none",
                  borderBottom: "1px solid var(--border)",
                  fontSize: "16px",
                  background: "transparent",
                  color: "var(--text-primary)",
                  outline: "none",
                }}
              />
            </form>
            <div style={{ padding: "8px 0" }}>
              <div style={{ padding: "8px 20px", fontSize: "12px", color: "var(--text-muted)" }}>
                Press Enter to search · Esc to close
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function getPageTitle(pathname: string): string {
  if (pathname === "/my-tasks") return "My Tasks";
  if (pathname === "/inbox") return "Inbox";
  if (pathname === "/goals") return "Goals";
  if (pathname.startsWith("/search")) return "Search";
  if (pathname.startsWith("/projects/")) {
    const parts = pathname.split("/");
    if (parts.length === 3) return "Project";
    if (parts[3] === "stats") return "Project Stats";
  }
  return "ViBe PM";
}
