import { describe, expect, it } from "vitest";
import { FormDefinitionSchema, readDefinition, type FormDefinition, type FormQuestion } from "@/lib/forms/definition";
import { answerText, isAnswered, missingRequired, progress, referencedFileIds, sanitizeAnswer } from "@/lib/forms/answers";

const q = (over: Partial<FormQuestion> & Pick<FormQuestion, "id" | "type">): FormQuestion => ({
  label: "Q", required: false, ...over,
} as FormQuestion);

const dropdown = q({
  id: "q1", type: "dropdown", label: "Grease/Solids Measured",
  options: [{ id: "o0", label: "0% – Compliant" }, { id: "o25", label: "25%" }],
});
const checks = q({
  id: "q2", type: "checkboxes", label: "Check all that apply",
  options: [{ id: "a", label: "Interceptor Pumping" }, { id: "b", label: "Hydrojetting" }, { id: "c", label: "Steam" }],
});

describe("sanitizeAnswer", () => {
  it("accepts only option ids that exist on the question", () => {
    expect(sanitizeAnswer(dropdown, "o0")).toBe("o0");
    expect(sanitizeAnswer(dropdown, "o-not-real")).toBeUndefined();
    expect(sanitizeAnswer(checks, ["a", "c"])).toEqual(["a", "c"]);
    expect(sanitizeAnswer(checks, ["a", "nope"])).toBeUndefined();
  });

  it("stores checkboxes in the form's order, not click order, so exports line up", () => {
    expect(sanitizeAnswer(checks, ["c", "a"])).toEqual(["a", "c"]);
    expect(sanitizeAnswer(checks, ["b", "b", "a"])).toEqual(["a", "b"]);
  });

  it("coerces numbers and refuses junk", () => {
    const n = q({ id: "n", type: "number" });
    expect(sanitizeAnswer(n, "12.5")).toBe(12.5);
    expect(sanitizeAnswer(n, "abc")).toBeUndefined();
    expect(sanitizeAnswer(n, Infinity)).toBeUndefined();
  });

  it("requires a real calendar date", () => {
    const d = q({ id: "d", type: "date" });
    expect(sanitizeAnswer(d, "2026-09-15")).toBe("2026-09-15");
    expect(sanitizeAnswer(d, "15/09/2026")).toBeUndefined();
    expect(sanitizeAnswer(d, "2026-13-40")).toBeUndefined();
  });

  it("treats an empty value as cleared, not invalid", () => {
    expect(sanitizeAnswer(dropdown, "")).toBeNull();
    expect(sanitizeAnswer(dropdown, null)).toBeNull();
  });
});

describe("required questions", () => {
  const def: FormDefinition = {
    sections: [
      { id: "s1", title: "Photos", questions: [q({ id: "before", type: "images", required: true }), q({ id: "after", type: "images", required: true })] },
      { id: "s2", title: "FOG", questions: [{ ...dropdown, required: true }, checks] },
    ],
  };

  it("lists what is missing, in form order", () => {
    expect(missingRequired(def, {}).map((x) => x.id)).toEqual(["before", "after", "q1"]);
    expect(missingRequired(def, { before: ["f1"], after: ["f2"], q1: "o0" })).toEqual([]);
  });

  it("does not count an empty array or blank string as answered", () => {
    expect(isAnswered(q({ id: "x", type: "images" }), [])).toBe(false);
    expect(isAnswered(q({ id: "x", type: "short_text" }), "   ")).toBe(false);
    expect(missingRequired(def, { before: [], after: ["f"], q1: "o0" }).map((x) => x.id)).toEqual(["before"]);
  });

  it("counts progress over required and total separately", () => {
    expect(progress(def, { before: ["f"], q1: "o0" })).toEqual({ answered: 2, total: 4, requiredAnswered: 2, requiredTotal: 3 });
  });
});

describe("referencedFileIds", () => {
  it("collects image and signature ids only", () => {
    const def: FormDefinition = {
      sections: [{
        id: "s", title: "s",
        questions: [q({ id: "photos", type: "images" }), q({ id: "sig", type: "signature" }), q({ id: "text", type: "short_text" })],
      }],
    };
    expect(referencedFileIds(def, { photos: ["a", "b"], sig: "c", text: "not a file" }).sort()).toEqual(["a", "b", "c"]);
  });
});

describe("answerText", () => {
  it("renders option labels, not ids", () => {
    expect(answerText(dropdown, "o0")).toBe("0% – Compliant");
    expect(answerText(checks, ["a", "c"])).toBe("Interceptor Pumping; Steam");
  });

  it("says so when an option was deleted from the form after the answer was given", () => {
    expect(answerText(dropdown, "o-gone")).toBe("(removed option)");
  });

  it("formats a date without shifting it across a time zone", () => {
    expect(answerText(q({ id: "d", type: "date" }), "2026-01-01")).toBe("Jan 1, 2026");
  });
});

describe("definition schema", () => {
  it("refuses a dropdown with no options", () => {
    const bad = { sections: [{ id: "s", title: "s", questions: [{ id: "q", type: "dropdown", label: "Pick", required: true, options: [] }] }] };
    expect(FormDefinitionSchema.safeParse(bad).success).toBe(false);
  });

  it("refuses two questions sharing an id", () => {
    const bad = {
      sections: [
        { id: "s1", title: "a", questions: [{ id: "dupe", type: "short_text", label: "A", required: false }] },
        { id: "s2", title: "b", questions: [{ id: "dupe", type: "short_text", label: "B", required: false }] },
      ],
    };
    expect(FormDefinitionSchema.safeParse(bad).success).toBe(false);
  });

  it("allows two questions sharing a LABEL — the duplicate-label trap that breaks Jobber's export", () => {
    const ok = {
      sections: [{
        id: "s", title: "s",
        questions: [
          { id: "q1", type: "images", label: "Photos", required: false },
          { id: "q2", type: "images", label: "Photos", required: false },
        ],
      }],
    };
    expect(FormDefinitionSchema.safeParse(ok).success).toBe(true);
  });

  it("reads a malformed stored definition as empty rather than throwing", () => {
    expect(readDefinition({ sections: "nonsense" })).toEqual({ sections: [] });
    expect(readDefinition(null)).toEqual({ sections: [] });
  });
});
