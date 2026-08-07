"use client";
import { useState, useEffect, use } from "react";

interface Project { id: string; name: string; description: string | null; color: string; status: string; }
interface ProjectSettings { messagingChannelId: string | null; notifyOn: string[]; }

const NOTIFY_OPTIONS = [
  { key: "task.created", label: "Task created" },
  { key: "task.completed", label: "Task completed" },
  { key: "task.overdue", label: "Task overdue" },
  { key: "task.assigned", label: "Task assigned" },
  { key: "milestone.reached", label: "Milestone reached" },
];

export default function ProjectSettingsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const [tab, setTab] = useState("general");
  const [project, setProject] = useState<Project | null>(null);
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/pm/projects/${projectId}`).then(r => r.json()).then(d => setProject(d.project));
    fetch(`/api/pm/projects/${projectId}/settings`).then(r => r.json()).then(d => setSettings(d.settings));
  }, [projectId]);

  const saveProject = async (patch: Partial<Project>) => {
    setSaving(true);
    const res = await fetch(`/api/pm/projects/${projectId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const d = await res.json();
    if (d.project) setProject(d.project);
    setSaving(false);
  };

  const saveSettings = async (patch: Partial<ProjectSettings>) => {
    const newSettings = { ...settings, ...patch };
    setSettings(newSettings as ProjectSettings);
    await fetch(`/api/pm/projects/${projectId}/settings`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
  };

  const TABS = ["general", "members", "messaging", "automations"];

  if (!project) return <div style={{ padding: "32px", color: "var(--text-muted)" }}>Loading...</div>;

  return (
    <div style={{ maxWidth: "700px", margin: "0 auto", padding: "32px 24px" }}>
      <h2 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "24px" }}>Project Settings</h2>
      <div style={{ display: "flex", gap: "4px", marginBottom: "28px", borderBottom: "1px solid var(--border)", paddingBottom: "0" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 16px", border: "none", background: "none", cursor: "pointer", fontSize: "14px",
            color: tab === t ? "var(--accent)" : "var(--text-secondary)",
            borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
            fontWeight: tab === t ? 600 : 400, textTransform: "capitalize",
          }}>
            {t}
          </button>
        ))}
      </div>

      {tab === "general" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <label>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px", textTransform: "uppercase" }}>Project name</div>
            <input value={project.name} onChange={e => setProject(p => p ? { ...p, name: e.target.value } : p)}
              onBlur={e => saveProject({ name: e.target.value })}
              style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "14px", background: "var(--bg)", color: "var(--text-primary)", outline: "none" }} />
          </label>
          <label>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px", textTransform: "uppercase" }}>Description</div>
            <textarea value={project.description ?? ""} onChange={e => setProject(p => p ? { ...p, description: e.target.value } : p)}
              onBlur={e => saveProject({ description: e.target.value })} rows={3}
              style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "14px", background: "var(--bg)", color: "var(--text-primary)", outline: "none", resize: "vertical", fontFamily: "inherit" }} />
          </label>
          <label>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px", textTransform: "uppercase" }}>Status</div>
            <select value={project.status} onChange={e => saveProject({ status: e.target.value })}
              style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "14px", background: "var(--bg)", color: "var(--text-primary)", cursor: "pointer" }}>
              <option value="active">Active</option>
              <option value="on_hold">On Hold</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          {saving && <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Saving...</div>}
        </div>
      )}

      {tab === "messaging" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>Link messaging channel</div>
            <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "12px" }}>
              Paste the channel ID from the messaging module to link this project.
              Task events will be posted to that channel.
            </div>
            <input
              value={settings?.messagingChannelId ?? ""}
              onChange={e => setSettings(s => s ? { ...s, messagingChannelId: e.target.value } : s)}
              onBlur={e => saveSettings({ messagingChannelId: e.target.value || null })}
              placeholder="Channel ID"
              style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "14px", background: "var(--bg)", color: "var(--text-primary)", outline: "none" }}
            />
          </div>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "12px" }}>Notifications</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {NOTIFY_OPTIONS.map(opt => {
                const checked = settings?.notifyOn?.includes(opt.key) ?? true;
                return (
                  <label key={opt.key} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                    <input type="checkbox" checked={checked}
                      onChange={e => {
                        const current = settings?.notifyOn ?? [];
                        const newOn = e.target.checked ? [...current, opt.key] : current.filter(k => k !== opt.key);
                        saveSettings({ notifyOn: newOn });
                      }}
                      style={{ width: "15px", height: "15px", accentColor: "var(--accent)", cursor: "pointer" }} />
                    <div>
                      <div style={{ fontSize: "14px", color: "var(--text-primary)" }}>{opt.label}</div>
                      {settings?.messagingChannelId && (
                        <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                          &rarr; {checked ? "Will post to" : "Won't post to"} #{settings.messagingChannelId}
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === "automations" && (
        <div>
          <AutomationsTab projectId={projectId} />
        </div>
      )}

      {tab === "members" && (
        <div style={{ color: "var(--text-muted)", fontSize: "14px" }}>Members management coming soon.</div>
      )}
    </div>
  );
}

function AutomationsTab({ projectId }: { projectId: string }) {
  const [automations, setAutomations] = useState<Array<{ id: string; name: string; triggerType: string; actionType: string; isEnabled: boolean; lastRunAt: string | null; runCount: number }>>([]);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    fetch(`/api/pm/projects/${projectId}/automations`).then(r => r.json()).then(d => setAutomations(d.automations ?? []));
  }, [projectId]);

  const toggle = async (id: string) => {
    const res = await fetch(`/api/pm/automations/${id}/toggle`, { method: "PATCH" });
    const d = await res.json();
    setAutomations(a => a.map(x => x.id === id ? d.automation : x));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
        <button onClick={() => setShowNew(true)} style={{ padding: "8px 14px", background: "var(--accent)", color: "white", border: "none", borderRadius: "6px", fontSize: "13px", cursor: "pointer" }}>+ Add Rule</button>
      </div>
      {automations.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
          <div style={{ fontSize: "32px", marginBottom: "8px" }}>&#9889;</div>
          <div>No automations yet. Create rules to automate your workflow.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {automations.map(auto => (
            <div key={auto.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>{auto.name}</div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  WHEN {auto.triggerType} &rarr; THEN {auto.actionType}
                  {auto.lastRunAt && <span> &middot; Last run {new Date(auto.lastRunAt).toLocaleDateString()}</span>}
                  {auto.runCount > 0 && <span> &middot; {auto.runCount} runs</span>}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "2px", background: auto.isEnabled ? "var(--positive)" : "var(--border)", borderRadius: "20px", padding: "2px", width: "36px", cursor: "pointer", transition: "background 0.2s" }} onClick={() => toggle(auto.id)}>
                <div style={{ width: "16px", height: "16px", background: "white", borderRadius: "50%", marginLeft: auto.isEnabled ? "16px" : "0", transition: "margin 0.2s" }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
