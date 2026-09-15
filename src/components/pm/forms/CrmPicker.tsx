"use client";
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { apiFetch } from "@/lib/base-path";

export interface CrmRecord {
  type: "company" | "person";
  id: string;
  name: string;
  subtitle: string | null;
  email?: string | null;
  companyId?: string | null;
  companyName?: string | null;
}

/**
 * Type-ahead over the CRM. The browser never sends a tenant: the PM server
 * signs the lookup with this session's organization, so the only records that
 * can come back are this workspace's.
 */
export function CrmPicker({
  type,
  companyId,
  value,
  onChange,
  label,
  placeholder,
}: {
  type: "company" | "person";
  companyId?: string | null;
  value: CrmRecord | null;
  onChange: (record: CrmRecord | null) => void;
  label: string;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<CrmRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "unavailable" | "no_workspace">("idle");
  const box = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setState("loading");
      const params = new URLSearchParams({ type, q: query });
      if (type === "person" && companyId) params.set("companyId", companyId);
      try {
        const res = await apiFetch(`/api/pm/crm/lookup?${params}`);
        const d = await res.json();
        if (id !== seq.current) return; // a newer keystroke won
        setRecords(d.records ?? []);
        setState(!res.ok ? "unavailable" : d.configured === false ? "unavailable" : d.noWorkspace ? "no_workspace" : "idle");
      } catch {
        if (id === seq.current) setState("unavailable");
      }
    }, 220);
    return () => clearTimeout(t);
  }, [query, open, type, companyId]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div ref={box} style={{ position: "relative" }}>
      <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>{label}</label>

      {value ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value.name}</div>
            {value.subtitle && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{value.subtitle}</div>}
          </div>
          <button onClick={() => { onChange(null); setQuery(""); }} aria-label={`Clear ${label}`} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}>
            <X size={15} />
          </button>
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder ?? `Search ${type === "company" ? "customers" : "contacts"}…`}
            style={{ width: "100%", padding: "9px 12px 9px 32px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14, background: "var(--bg)", color: "var(--text-primary)", outline: "none" }}
          />
        </div>
      )}

      {open && !value && (
        <div style={{ position: "absolute", zIndex: 30, left: 0, right: 0, top: "100%", marginTop: 4, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 12px 32px rgba(0,0,0,0.18)", maxHeight: 260, overflowY: "auto" }}>
          {state === "loading" && <Note>Searching…</Note>}
          {state === "unavailable" && <Note>The CRM could not be reached. You can start without a customer.</Note>}
          {state === "no_workspace" && <Note>This workspace has no CRM yet.</Note>}
          {state === "idle" && records.length === 0 && <Note>No matches.</Note>}
          {state !== "unavailable" && records.map((r) => (
            <button
              key={r.id}
              onClick={() => { onChange(r); setOpen(false); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", background: "none", border: "none", cursor: "pointer" }}
            >
              <div style={{ fontSize: 14, color: "var(--text-primary)" }}>{r.name}</div>
              {(r.subtitle || r.companyName) && (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{r.subtitle ?? r.companyName}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "10px 12px", fontSize: 13, color: "var(--text-muted)" }}>{children}</div>;
}
