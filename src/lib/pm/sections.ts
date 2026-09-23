/**
 * Where tasks go when their section cannot be shown.
 *
 * `tasks.section_id` is nullable and every task born from an import, the
 * service API or the chat webhook arrives without one. A section can also be
 * archived out from under its tasks, and the sections endpoint only returns
 * `isArchived: false` — so from a view's point of view that task's section
 * simply is not there. Both views used to group by matching a task's section
 * against the sections they had, which meant these tasks matched nothing and
 * rendered nowhere at all: loaded, counted, then silently dropped.
 *
 * Shared so the list and the board agree on the rule and on the label.
 */
export const NO_SECTION_KEY = "__no_section__";
export const NO_SECTION_LABEL = "(No section)";

/** True when this task has no section, or one that is not on screen. */
export function hasNoVisibleSection(
  sectionId: string | null | undefined,
  visibleSectionIds: Set<string>,
): boolean {
  return !sectionId || !visibleSectionIds.has(sectionId);
}
