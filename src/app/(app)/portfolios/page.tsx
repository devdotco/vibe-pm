"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Assignee { id: string; name: string; avatarUrl: string | null; }
interface PortfolioProject {
  id: string; name: string; color: string; teamName: string | null;
  dueDate: string | null; status: 'on_track' | 'at_risk' | 'off_track' | 'completed';
  total: number; completed: number; overdue: number; progress: number;
  assignees: Assignee[]; extraAssignees: number; linkedGoal: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  on_track: 'On Track',
  at_risk: 'At Risk',
  off_track: 'Off Track',
  completed: 'Completed',
};
const STATUS_COLOR: Record<string, string> = {
  on_track: 'var(--positive)',
  at_risk: 'var(--warning)',
  off_track: 'var(--negative)',
  completed: 'var(--text-muted)',
};

function Avatar({ name, avatarUrl, size = 24 }: { name: string; avatarUrl?: string | null; size?: number }) {
  const colors = ['#2f5cff', '#0d8f80', '#a6620a', '#6d4be0', '#0f7a52'];
  const bg = colors[name.charCodeAt(0) % colors.length]!;
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} title={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  }
  return (
    <div title={name} style={{ width: size, height: size, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 600, color: 'white', flexShrink: 0 }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function ProjectCard({ project }: { project: PortfolioProject }) {
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = project.dueDate && project.dueDate < today && project.status !== 'completed';
  const overdueDays = isOverdue ? Math.floor((Date.now() - new Date(project.dueDate!).getTime()) / 86400000) : 0;

  return (
    <Link href={`/projects/${project.id}`} style={{ textDecoration: 'none' }}>
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', cursor: 'pointer', transition: 'box-shadow 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)')}
        onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: project.color, flexShrink: 0 }} />
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</div>
              {project.teamName && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>{project.teamName}</div>
              )}
            </div>
          </div>
          <span style={{ flexShrink: 0, padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, background: STATUS_COLOR[project.status] + '22', color: STATUS_COLOR[project.status], border: `1px solid ${STATUS_COLOR[project.status]}44` }}>
            {STATUS_LABEL[project.status]}
          </span>
        </div>

        {/* Progress bar */}
        <div>
          <div style={{ height: '6px', background: 'var(--panel-hover)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${project.progress}%`, background: project.status === 'completed' ? 'var(--positive)' : project.status === 'off_track' ? 'var(--negative)' : 'var(--accent)', borderRadius: '3px', transition: 'width 0.3s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
            <span>{project.progress}% complete</span>
            <span>{project.completed}/{project.total} tasks</span>
          </div>
        </div>

        {/* Due date */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ fontSize: '12px', color: isOverdue ? 'var(--negative)' : 'var(--text-secondary)' }}>
            {project.dueDate ? (
              isOverdue ? `Overdue by ${overdueDays}d` : `Due ${new Date(project.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
            ) : (
              <span style={{ color: 'var(--text-muted)' }}>No due date</span>
            )}
          </div>
          {project.overdue > 0 && (
            <span style={{ padding: '1px 7px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, background: 'var(--negative)', color: 'white' }}>
              {project.overdue} overdue
            </span>
          )}
        </div>

        {/* Assignees */}
        {project.assignees.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {project.assignees.map((a, i) => (
              <div key={a.id} style={{ marginLeft: i > 0 ? '-6px' : '0', zIndex: project.assignees.length - i, position: 'relative', border: '2px solid var(--bg-elevated)', borderRadius: '50%' }}>
                <Avatar name={a.name} avatarUrl={a.avatarUrl} size={22} />
              </div>
            ))}
            {project.extraAssignees > 0 && (
              <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--panel-hover)', border: '2px solid var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: 'var(--text-muted)', marginLeft: '-6px', fontWeight: 600 }}>
                +{project.extraAssignees}
              </div>
            )}
          </div>
        )}

        {/* Linked goal */}
        {project.linkedGoal && (
          <div style={{ fontSize: '11px', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>🎯</span> {project.linkedGoal}
          </div>
        )}
      </div>
    </Link>
  );
}

export default function PortfolioPage() {
  const [projects, setProjects] = useState<PortfolioProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/pm/portfolio')
      .then(r => r.json())
      .then(d => { setProjects(d.projects ?? []); setLoading(false); });
  }, []);

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1400px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Portfolio</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>Health overview across all your projects</p>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', height: '200px', animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)', fontSize: '14px' }}>
          No projects found. Create a project to see it here.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {projects.map(p => <ProjectCard key={p.id} project={p} />)}
        </div>
      )}
    </div>
  );
}
