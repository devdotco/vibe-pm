"use client";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlignLeft, Calendar, CheckSquare, ChevronDown, GripVertical, Hash, Image as ImageIcon,
  MoreHorizontal, PenLine, Plus, Monitor, Smartphone, Type,
} from "lucide-react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { apiFetch, withBase } from "@/lib/base-path";
import {
  QUESTION_TYPE_LABELS, TYPES_WITH_OPTIONS, newId,
  type FormDefinition, type FormQuestion, type FormSection, type QuestionType,
} from "@/lib/forms/definition";
import { QuestionField } from "@/components/pm/forms/QuestionField";

const TYPE_ICONS: Record<QuestionType, React.ComponentType<{ size?: number }>> = {
  short_text: Type,
  long_text: AlignLeft,
  dropdown: ChevronDown,
  checkboxes: CheckSquare,
  number: Hash,
  images: ImageIcon,
  date: Calendar,
  signature: PenLine,
};

interface ProjectOption { id: string; name: string }
interface SectionOption { id: string; name: string }
interface MemberOption { id: string; name: string; status: string }

interface FormState {
  title: string;
  description: string | null;
  definition: FormDefinition;
  defaultProjectId: string | null;
  defaultSectionId: string | null;
  defaultAssigneeId: string | null;
  autoAttachProjectIds: string[];
}

export default function FormBuilderPage({ params }: { params: Promise<{ formId: string }> }) {
  const { formId } = use(params);
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [preview, setPreview] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, unknown>>({});

  useEffect(() => {
    apiFetch(`/api/pm/forms/${formId}`).then((r) => r.json()).then((d) => {
      if (!d.form) { setError(d.error ?? "Form not found"); return; }
      if (!d.canManage) { router.replace(withBase(`/forms/${formId}`)); return; }
      setForm({
        title: d.form.title,
        description: d.form.description,
        definition: d.form.definition,
        defaultProjectId: d.form.defaultProjectId,
        defaultSectionId: d.form.defaultSectionId,
        defaultAssigneeId: d.form.defaultAssigneeId,
        autoAttachProjectIds: d.form.autoAttachProjectIds ?? [],
      });
      setSaved(JSON.stringify(d.form.definition) + d.form.title);
      setActiveSection(d.form.definition.sections[0]?.id ?? null);
    });
    apiFetch("/api/pm/projects").then((r) => r.json()).then((d) => setProjects(d.projects ?? []));
    apiFetch("/api/pm/admin/users").then((r) => r.json()).then((d) => setMembers(d.users ?? []));
  }, [formId, router]);

  useEffect(() => {
    if (!form?.defaultProjectId) { setSections([]); return; }
    apiFetch(`/api/pm/projects/${form.defaultProjectId}/sections`).then((r) => r.json()).then((d) => setSections(d.sections ?? []));
  }, [form?.defaultProjectId]);

  const update = useCallback((patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f)), []);
  const updateDefinition = useCallback((fn: (d: FormDefinition) => FormDefinition) => {
    setForm((f) => (f ? { ...f, definition: fn(f.definition) } : f));
  }, []);

  const dirty = useMemo(() => !!form && JSON.stringify(form.definition) + form.title !== saved, [form, saved]);

  // Leaving with unsaved questions loses real work — a browser prompt is the
  // only thing that survives a swipe-back on a phone.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setError("");
    const res = await apiFetch(`/api/pm/forms/${formId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error ?? "Could not save"); return; }
    setSaved(JSON.stringify(form.definition) + form.title);
    router.push(withBase(`/forms/${formId}`));
  };

  const addSection = () => {
    const section: FormSection = { id: newId("s"), title: "New section", questions: [] };
    updateDefinition((d) => ({ sections: [...d.sections, section] }));
    setActiveSection(section.id);
  };

  const addQuestion = (type: QuestionType) => {
    setForm((f) => {
      if (!f) return f;
      let sections = f.definition.sections;
      // Land in the section last touched; with no sections at all, make one.
      let targetId = activeSection && sections.some((s) => s.id === activeSection) ? activeSection : sections[sections.length - 1]?.id;
      if (!targetId) {
        const s: FormSection = { id: newId("s"), title: "New section", questions: [] };
        sections = [...sections, s];
        targetId = s.id;
      }
      const question: FormQuestion = {
        id: newId("q"),
        type,
        label: "",
        required: false,
        ...(TYPES_WITH_OPTIONS.has(type) ? { options: [{ id: newId("o"), label: "" }] } : {}),
      };
      return {
        ...f,
        definition: { sections: sections.map((s) => (s.id === targetId ? { ...s, questions: [...s.questions, question] } : s)) },
      };
    });
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  if (error && !form) return <div style={{ padding: 40, color: "var(--text-muted)" }}>{error}</div>;
  if (!form) return <div style={{ padding: 40, color: "var(--text-muted)" }}>Loading…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)", flexWrap: "wrap" }}>
        <div style={{ fontSize: 15.5, fontWeight: 650, color: "var(--text-primary)", flex: "1 1 200px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          Edit {form.title || "Untitled form"}
        </div>
        <div style={{ display: "flex", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: 2 }}>
          <Toggle active={preview} onClick={() => setPreview(true)}>Preview</Toggle>
          <Toggle active={!preview} onClick={() => setPreview(false)}>Edit</Toggle>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          <IconToggle active={narrow} onClick={() => setNarrow(true)} label="Phone width"><Smartphone size={16} /></IconToggle>
          <IconToggle active={!narrow} onClick={() => setNarrow(false)} label="Desktop width"><Monitor size={16} /></IconToggle>
        </div>
        <button onClick={() => router.push(withBase(`/forms/${formId}`))} style={ghostBtn}>Cancel</button>
        <button onClick={save} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.7 : 1 }}>{busy ? "Saving…" : "Save"}</button>
      </div>

      {error && <div style={{ padding: "10px 20px", background: "#fef2f2", color: "#b91c1c", fontSize: 13 }}>{error}</div>}

      <div style={{ display: "flex", flex: 1, minHeight: 0, alignItems: "stretch" }}>
        {/* Canvas */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px 120px", background: "var(--bg)" }}>
          <div style={{ maxWidth: narrow ? 420 : 760, margin: "0 auto" }}>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e: DragEndEvent) => {
                const { active, over } = e;
                if (!over || active.id === over.id) return;
                updateDefinition((d) => {
                  const from = d.sections.findIndex((s) => s.id === active.id);
                  const to = d.sections.findIndex((s) => s.id === over.id);
                  return from < 0 || to < 0 ? d : { sections: arrayMove(d.sections, from, to) };
                });
              }}
            >
              <SortableContext items={form.definition.sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                {form.definition.sections.map((section) => (
                  <SectionCard
                    key={section.id}
                    section={section}
                    preview={preview}
                    active={activeSection === section.id}
                    onFocus={() => setActiveSection(section.id)}
                    previewAnswers={previewAnswers}
                    setPreviewAnswers={setPreviewAnswers}
                    onChange={(next) => updateDefinition((d) => ({ sections: d.sections.map((s) => (s.id === section.id ? next : s)) }))}
                    onDuplicate={() => updateDefinition((d) => {
                      const copy: FormSection = {
                        id: newId("s"),
                        title: `${section.title} (copy)`,
                        questions: section.questions.map((q) => ({ ...q, id: newId("q"), options: q.options?.map((o) => ({ ...o, id: newId("o") })) })),
                      };
                      const at = d.sections.findIndex((s) => s.id === section.id);
                      const next = [...d.sections];
                      next.splice(at + 1, 0, copy);
                      return { sections: next };
                    })}
                    onDelete={() => updateDefinition((d) => ({ sections: d.sections.filter((s) => s.id !== section.id) }))}
                    onAddQuestion={addQuestion}
                  />
                ))}
              </SortableContext>
            </DndContext>

            {form.definition.sections.length === 0 && (
              <div style={{ border: "1px dashed var(--border)", borderRadius: 12, padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
                <div style={{ fontSize: 14.5, color: "var(--text-primary)", fontWeight: 600 }}>This form is empty</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>Add a section, then the questions that go in it.</div>
                <button onClick={addSection} style={{ ...primaryBtn, marginTop: 14 }}>Add section</button>
              </div>
            )}
          </div>
        </div>

        {/* Manage panel */}
        <aside style={{ width: 320, flexShrink: 0, borderLeft: "1px solid var(--border)", background: "var(--bg-elevated)", overflowY: "auto", padding: "20px 18px 80px" }} className="pm-form-panel">
          <h2 style={{ fontSize: 15.5, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 }}>Manage form</h2>

          <Labelled label="Form title">
            <input value={form.title} onChange={(e) => update({ title: e.target.value })} style={fieldStyle} />
          </Labelled>

          <Labelled label="Description (optional)">
            <textarea value={form.description ?? ""} onChange={(e) => update({ description: e.target.value || null })} rows={2} style={{ ...fieldStyle, resize: "vertical" }} />
          </Labelled>

          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", margin: "20px 0 8px" }}>When a form is started</div>

          <Labelled label="Default project">
            <select value={form.defaultProjectId ?? ""} onChange={(e) => update({ defaultProjectId: e.target.value || null, defaultSectionId: null })} style={fieldStyle}>
              <option value="">Ask each time</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Labelled>

          {form.defaultProjectId && (
            <Labelled label="Default section">
              <select value={form.defaultSectionId ?? ""} onChange={(e) => update({ defaultSectionId: e.target.value || null })} style={fieldStyle}>
                <option value="">Top of the project</option>
                {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Labelled>
          )}

          <Labelled label="Default assignee">
            <select value={form.defaultAssigneeId ?? ""} onChange={(e) => update({ defaultAssigneeId: e.target.value || null })} style={fieldStyle}>
              <option value="">Whoever starts it</option>
              {members.filter((m) => m.status === "active").map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Labelled>

          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", margin: "20px 0 8px" }}>Automatically attach</div>
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 8 }}>
            Every new task in these projects starts with this form attached.
          </p>
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, maxHeight: 168, overflowY: "auto", background: "var(--bg)" }}>
            {projects.length === 0 && <div style={{ padding: 10, fontSize: 13, color: "var(--text-muted)" }}>No projects yet.</div>}
            {projects.map((p) => (
              <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", cursor: "pointer", fontSize: 13.5, color: "var(--text-primary)" }}>
                <input
                  type="checkbox"
                  checked={form.autoAttachProjectIds.includes(p.id)}
                  onChange={(e) => update({
                    autoAttachProjectIds: e.target.checked
                      ? [...form.autoAttachProjectIds, p.id]
                      : form.autoAttachProjectIds.filter((id) => id !== p.id),
                  })}
                  style={{ width: 16, height: 16, accentColor: "var(--accent)" }}
                />
                {p.name}
              </label>
            ))}
          </div>

          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", margin: "22px 0 8px" }}>Layout options</div>
          <PanelButton onClick={addSection} icon={<Plus size={16} />}>Add section</PanelButton>

          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", margin: "22px 0 4px" }}>Custom questions</div>
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 8 }}>Select the type of question you&apos;d like to ask</p>
          <div style={{ display: "grid", gap: 4 }}>
            {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((type) => {
              const Icon = TYPE_ICONS[type];
              return (
                <PanelButton key={type} onClick={() => addQuestion(type)} icon={<Icon size={16} />}>
                  {QUESTION_TYPE_LABELS[type]}
                </PanelButton>
              );
            })}
          </div>
        </aside>
      </div>

      <style>{`@media (max-width: 900px) { .pm-form-panel { position: fixed; inset: auto 0 0 0; width: 100% !important; max-height: 46vh; border-left: none; border-top: 1px solid var(--border); z-index: 40; } }`}</style>
    </div>
  );
}

function SectionCard({
  section, preview, active, onFocus, onChange, onDuplicate, onDelete, onAddQuestion, previewAnswers, setPreviewAnswers,
}: {
  section: FormSection;
  preview: boolean;
  active: boolean;
  onFocus: () => void;
  onChange: (next: FormSection) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAddQuestion: (type: QuestionType) => void;
  previewAnswers: Record<string, unknown>;
  setPreviewAnswers: (fn: (a: Record<string, unknown>) => Record<string, unknown>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id, disabled: preview });
  const [menu, setMenu] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  return (
    <div
      ref={setNodeRef}
      onClick={onFocus}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        border: `1px solid ${active && !preview ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 12,
        background: "var(--bg-elevated)",
        padding: "18px 20px 8px",
        marginBottom: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        {!preview && (
          <button {...attributes} {...listeners} aria-label="Reorder section" style={{ background: "none", border: "none", cursor: "grab", color: "var(--text-muted)", display: "flex", padding: 2 }}>
            <GripVertical size={16} />
          </button>
        )}
        {preview ? (
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", flex: 1 }}>{section.title}</div>
        ) : (
          <input
            value={section.title}
            onChange={(e) => onChange({ ...section, title: e.target.value })}
            placeholder="Section title"
            style={{ flex: 1, fontSize: 15, fontWeight: 700, color: "var(--text-primary)", background: "transparent", border: "none", outline: "none", padding: 0 }}
          />
        )}
        {!preview && (
          <div style={{ position: "relative" }}>
            <button onClick={(e) => { e.stopPropagation(); setMenu((m) => !m); }} aria-label="Section options" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}>
              <MoreHorizontal size={18} />
            </button>
            {menu && (
              <div onMouseLeave={() => setMenu(false)} style={{ position: "absolute", right: 0, top: 24, zIndex: 20, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 12px 32px rgba(0,0,0,0.18)", minWidth: 150, padding: 4 }}>
                <button onClick={() => { setMenu(false); onDuplicate(); }} style={menuItem}>Duplicate section</button>
                <button onClick={() => { setMenu(false); onDelete(); }} style={{ ...menuItem, color: "#ef4444" }}>Delete section</button>
              </div>
            )}
          </div>
        )}
      </div>

      {preview ? (
        section.questions.map((q) => (
          <QuestionField
            key={q.id}
            question={q}
            value={previewAnswers[q.id] as never}
            files={[]}
            onChange={(v) => setPreviewAnswers((a) => ({ ...a, [q.id]: v }))}
          />
        ))
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={({ active: a, over }) => {
            if (!over || a.id === over.id) return;
            const from = section.questions.findIndex((q) => q.id === a.id);
            const to = section.questions.findIndex((q) => q.id === over.id);
            if (from >= 0 && to >= 0) onChange({ ...section, questions: arrayMove(section.questions, from, to) });
          }}
        >
          <SortableContext items={section.questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
            {section.questions.map((q) => (
              <QuestionEditor
                key={q.id}
                question={q}
                onChange={(next) => onChange({ ...section, questions: section.questions.map((x) => (x.id === q.id ? next : x)) })}
                onDelete={() => onChange({ ...section, questions: section.questions.filter((x) => x.id !== q.id) })}
                onDuplicate={() => {
                  const copy = { ...q, id: newId("q"), options: q.options?.map((o) => ({ ...o, id: newId("o") })) };
                  const at = section.questions.findIndex((x) => x.id === q.id);
                  const next = [...section.questions];
                  next.splice(at + 1, 0, copy);
                  onChange({ ...section, questions: next });
                }}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}

      {!preview && (
        <button
          onClick={() => onAddQuestion("short_text")}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", padding: "12px 0", background: "none", border: "none", color: "var(--accent)", fontSize: 13.5, fontWeight: 500, cursor: "pointer" }}
        >
          <Plus size={15} /> Add Question
        </button>
      )}
    </div>
  );
}

function QuestionEditor({ question, onChange, onDelete, onDuplicate }: {
  question: FormQuestion;
  onChange: (q: FormQuestion) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: question.id });
  const [menu, setMenu] = useState(false);
  const Icon = TYPE_ICONS[question.type];
  const hasOptions = TYPES_WITH_OPTIONS.has(question.type);
  const labelRef = useRef<HTMLTextAreaElement>(null);

  // A new question arrives with an empty label; focus it so typing just works.
  useEffect(() => {
    if (!question.label) labelRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, borderTop: "1px solid var(--border)", padding: "14px 0" }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <span style={{ color: "var(--text-muted)", display: "flex", paddingTop: 7 }}><Icon size={15} /></span>
        <textarea
          ref={labelRef}
          value={question.label}
          onChange={(e) => onChange({ ...question, label: e.target.value })}
          placeholder={`${QUESTION_TYPE_LABELS[question.type]} question`}
          rows={1}
          style={{ flex: 1, fontSize: 14, color: "var(--text-primary)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 10px", outline: "none", resize: "vertical", minHeight: 38 }}
        />
        <button {...attributes} {...listeners} aria-label="Reorder question" style={{ background: "none", border: "none", cursor: "grab", color: "var(--text-muted)", display: "flex", padding: "8px 2px" }}>
          <GripVertical size={15} />
        </button>
        <div style={{ position: "relative" }}>
          <button onClick={() => setMenu((m) => !m)} aria-label="Question options" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex", padding: "8px 2px" }}>
            <MoreHorizontal size={16} />
          </button>
          {menu && (
            <div onMouseLeave={() => setMenu(false)} style={{ position: "absolute", right: 0, top: 28, zIndex: 20, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 12px 32px rgba(0,0,0,0.18)", minWidth: 150, padding: 4 }}>
              <button onClick={() => { setMenu(false); onDuplicate(); }} style={menuItem}>Duplicate</button>
              <button onClick={() => { setMenu(false); onDelete(); }} style={{ ...menuItem, color: "#ef4444" }}>Delete</button>
            </div>
          )}
        </div>
      </div>

      {hasOptions && (
        <div style={{ margin: "10px 0 4px 23px" }}>
          {(question.options ?? []).map((o, i) => (
            <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)", width: 16 }}>{i + 1}.</span>
              <input
                value={o.label}
                onChange={(e) => onChange({ ...question, options: (question.options ?? []).map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)) })}
                placeholder="Option text"
                style={{ flex: 1, fontSize: 13.5, padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg)", color: "var(--text-primary)", outline: "none" }}
              />
              <button
                onClick={() => onChange({ ...question, options: (question.options ?? []).filter((x) => x.id !== o.id) })}
                aria-label="Remove option"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 16, lineHeight: 1 }}
              >
                ×
              </button>
            </div>
          ))}
          <button
            onClick={() => onChange({ ...question, options: [...(question.options ?? []), { id: newId("o"), label: "" }] })}
            style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 13, cursor: "pointer", padding: "4px 0" }}
          >
            + Add option
          </button>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginLeft: 23, marginTop: 8 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-muted)", cursor: "pointer" }}>
          <input type="checkbox" checked={question.required} onChange={(e) => onChange({ ...question, required: e.target.checked })} style={{ width: 15, height: 15, accentColor: "var(--accent)" }} />
          Required
        </label>
        <input
          value={question.help ?? ""}
          onChange={(e) => onChange({ ...question, help: e.target.value || undefined })}
          placeholder="Helper text (optional)"
          style={{ flex: 1, fontSize: 12.5, padding: "6px 8px", border: "1px solid transparent", borderRadius: 6, background: "transparent", color: "var(--text-secondary)", outline: "none" }}
          onFocus={(e) => (e.currentTarget.style.border = "1px solid var(--border)")}
          onBlur={(e) => (e.currentTarget.style.border = "1px solid transparent")}
        />
      </div>
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

function PanelButton({ children, icon, onClick }: { children: React.ReactNode; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)", color: "var(--text-primary)", fontSize: 13.5, cursor: "pointer", textAlign: "left" }}
    >
      <span style={{ color: "var(--text-muted)", display: "flex" }}>{icon}</span>
      {children}
    </button>
  );
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{ padding: "6px 16px", borderRadius: 6, border: active ? "1px solid var(--accent)" : "1px solid transparent", background: active ? "var(--bg-elevated)" : "transparent", color: active ? "var(--text-primary)" : "var(--text-muted)", fontSize: 13.5, fontWeight: 500, cursor: "pointer" }}
    >
      {children}
    </button>
  );
}

function IconToggle({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 32, borderRadius: 6, border: active ? "1px solid var(--accent)" : "1px solid var(--border)", background: "var(--bg)", color: active ? "var(--accent)" : "var(--text-muted)", cursor: "pointer" }}
    >
      {children}
    </button>
  );
}

const fieldStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 7,
  fontSize: 13.5, background: "var(--bg)", color: "var(--text-primary)", outline: "none",
};
const menuItem: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "left", padding: "8px 10px",
  background: "none", border: "none", borderRadius: 6, fontSize: 13.5, color: "var(--text-primary)", cursor: "pointer",
};
const primaryBtn: React.CSSProperties = {
  padding: "8px 18px", background: "var(--accent)", color: "white", border: "none",
  borderRadius: 6, fontSize: 14, fontWeight: 500, cursor: "pointer",
};
const ghostBtn: React.CSSProperties = {
  padding: "8px 16px", border: "1px solid var(--border)", borderRadius: 6,
  background: "transparent", color: "var(--text-secondary)", fontSize: 14, cursor: "pointer",
};
