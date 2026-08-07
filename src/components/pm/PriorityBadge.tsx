"use client";

const PRIORITY_CONFIG = {
  urgent: { label: "Urgent", color: "#bf2434", dot: "#bf2434" },
  high: { label: "High", color: "#a6620a", dot: "#a6620a" },
  medium: { label: "Medium", color: "#2f5cff", dot: "#2f5cff" },
  low: { label: "Low", color: "#6c7484", dot: "#6c7484" },
  none: { label: "None", color: "#cdd2da", dot: "#cdd2da" },
};

export function PriorityDot({ priority }: { priority: string }) {
  const cfg = PRIORITY_CONFIG[priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.none;
  return (
    <span
      title={cfg.label}
      style={{
        display: "inline-block",
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        background: cfg.dot,
        flexShrink: 0,
      }}
    />
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const cfg = PRIORITY_CONFIG[priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.none;
  return (
    <span
      style={{
        fontSize: "11px",
        fontWeight: 500,
        color: cfg.color,
        padding: "2px 6px",
        borderRadius: "4px",
        background: cfg.color + "15",
        border: `1px solid ${cfg.color}30`,
      }}
    >
      {cfg.label}
    </span>
  );
}

export function PrioritySelect({
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
      {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
        <option key={k} value={k}>{v.label}</option>
      ))}
    </select>
  );
}
