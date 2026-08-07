"use client";
import { useState } from "react";

interface AdminUser {
  id: string;
  orgId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export function UsersAdminClient({ initialUsers }: { initialUsers: AdminUser[] }) {
  const [users, setUsers] = useState<AdminUser[]>(initialUsers);
  const [showAdd, setShowAdd] = useState(false);

  const toggleStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    const res = await fetch(`/api/pm/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    const d = await res.json();
    if (d.user) {
      setUsers(u => u.map(x => x.id === userId ? {
        ...d.user,
        createdAt: typeof d.user.createdAt === "string" ? d.user.createdAt : new Date(d.user.createdAt).toISOString(),
        updatedAt: typeof d.user.updatedAt === "string" ? d.user.updatedAt : new Date(d.user.updatedAt).toISOString(),
      } : x));
    }
  };

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "32px 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)" }}>Admin — Users</h1>
          <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "2px" }}>{users.length} user{users.length !== 1 ? "s" : ""}</div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          style={{ padding: "8px 16px", background: "var(--accent)", color: "white", border: "none", borderRadius: "6px", fontSize: "14px", fontWeight: 500, cursor: "pointer" }}
        >
          + Add User
        </button>
      </div>

      {/* Admin nav */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "24px", borderBottom: "1px solid var(--border)", paddingBottom: "0" }}>
        <a href="/admin/users" style={{ padding: "8px 16px", fontSize: "14px", fontWeight: 600, color: "var(--accent)", borderBottom: "2px solid var(--accent)", textDecoration: "none" }}>Users</a>
      </div>

      <div style={{ border: "1px solid var(--border)", borderRadius: "8px", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)" }}>
              <th style={{ padding: "10px 16px", textAlign: "left", fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>Name</th>
              <th style={{ padding: "10px 16px", textAlign: "left", fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>Email</th>
              <th style={{ padding: "10px 16px", textAlign: "left", fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>Org</th>
              <th style={{ padding: "10px 16px", textAlign: "left", fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>Status</th>
              <th style={{ padding: "10px 16px", textAlign: "left", fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)", fontSize: "14px" }}>No users yet</td>
              </tr>
            )}
            {users.map((u, i) => (
              <tr key={u.id} style={{ borderBottom: i < users.length - 1 ? "1px solid var(--border)" : "none" }}>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{
                      width: "32px", height: "32px", borderRadius: "50%", background: "var(--accent-subtle)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "13px", fontWeight: 600, color: "var(--accent)", flexShrink: 0,
                    }}>
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>{u.name}</span>
                  </div>
                </td>
                <td style={{ padding: "12px 16px", fontSize: "14px", color: "var(--text-secondary)" }}>{u.email}</td>
                <td style={{ padding: "12px 16px", fontSize: "12px", color: "var(--text-muted)" }}>{u.orgId}</td>
                <td style={{ padding: "12px 16px" }}>
                  <button
                    onClick={() => toggleStatus(u.id, u.status)}
                    style={{
                      padding: "3px 10px", borderRadius: "20px", border: "none", cursor: "pointer",
                      fontSize: "12px", fontWeight: 500,
                      background: u.status === "active" ? "#22c55e20" : "var(--border)",
                      color: u.status === "active" ? "#22c55e" : "var(--text-muted)",
                    }}
                  >
                    {u.status === "active" ? "Active" : "Inactive"}
                  </button>
                </td>
                <td style={{ padding: "12px 16px", fontSize: "13px", color: "var(--text-muted)" }}>
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <AddUserModal
          onClose={() => setShowAdd(false)}
          onCreated={(u) => { setUsers(prev => [u, ...prev]); setShowAdd(false); }}
        />
      )}
    </div>
  );
}

function AddUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: (u: AdminUser) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setLoading(true); setError("");
    const res = await fetch("/api/pm/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), email: email.trim() }),
    });
    const d = await res.json();
    if (d.user) {
      onCreated({
        ...d.user,
        createdAt: typeof d.user.createdAt === "string" ? d.user.createdAt : new Date(d.user.createdAt).toISOString(),
        updatedAt: typeof d.user.updatedAt === "string" ? d.user.updatedAt : new Date(d.user.updatedAt).toISOString(),
      });
    } else {
      setError(d.error ?? "Failed to create user");
      setLoading(false);
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "12px", padding: "24px", width: "360px", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "20px", color: "var(--text-primary)" }}>Add User</h3>
        <form onSubmit={submit}>
          <div style={{ marginBottom: "14px" }}>
            <label style={{ fontSize: "12px", color: "var(--text-muted)", display: "block", marginBottom: "5px" }}>Full name</label>
            <input
              autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith"
              style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "14px", background: "var(--bg)", color: "var(--text-primary)", outline: "none" }}
            />
          </div>
          <div style={{ marginBottom: "20px" }}>
            <label style={{ fontSize: "12px", color: "var(--text-muted)", display: "block", marginBottom: "5px" }}>Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com"
              style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "14px", background: "var(--bg)", color: "var(--text-primary)", outline: "none" }}
            />
          </div>
          {error && <div style={{ color: "#ef4444", fontSize: "13px", marginBottom: "12px" }}>{error}</div>}
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "16px" }}>
            An invite link will be emailed to the user.
          </div>
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 16px", border: "1px solid var(--border)", borderRadius: "6px", background: "transparent", color: "var(--text-secondary)", fontSize: "14px", cursor: "pointer" }}>Cancel</button>
            <button
              type="submit" disabled={loading || !name.trim() || !email.trim()}
              style={{ padding: "8px 16px", background: "var(--accent)", color: "white", border: "none", borderRadius: "6px", fontSize: "14px", cursor: "pointer", opacity: (loading || !name.trim() || !email.trim()) ? 0.6 : 1 }}
            >
              {loading ? "Adding..." : "Add & Invite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
