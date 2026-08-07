"use client";

const STATUS_CONFIG = {
  completed: { label: "Completed", color: "#0f7a52", bg: "#0f7a5215" },
  in_progress: { label: "In Progress", color: "#2f5cff", bg: "#2f5cff15" },
  blocked: { label: "Blocked", color: "#bf2434", bg: "#bf243415" },
  not_started: { label: "Not Started", color: "#6c7484", bg: "#6c748415" },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.not_started;
  return (
    <span
      style={{
        fontSize: "11px",
        fontWeight: 500,
        color: cfg.color,
        padding: "2px 6px",
        borderRadius: "4px",
        background: cfg.bg,
      }}
    >
      {cfg.label}
    </span>
  );
}

export function StatusSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: "4px 8px",
        border: "1px solid var(--border)",
        borderRadius: "6px",
        fontSize: "13px",
        background: "var(--bg)",
        color: "var(--text-primary)",
        cursor: "pointer",
      }}
    >
      {Object.entries(STATUS_CONFIG).map(([k, v]) => (
        <option key={k} value={k}>{v.label}</option>
      ))}
    </select>
  );
}

export function StatusDot({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.not_started;
  return (
    <span
      style={{
        display: "inline-block",
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        background: cfg.color,
        flexShrink: 0,
      }}
    />
  );
}
