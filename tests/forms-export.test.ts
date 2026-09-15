import { describe, expect, it } from "vitest";
import { buildColumns, cell, toCsv, type CsvSubmission } from "@/lib/forms/csv";
import { winAnsi, wrapText } from "@/lib/forms/pdf";
import type { FormDefinition } from "@/lib/forms/definition";

const v1: FormDefinition = {
  sections: [{
    id: "s", title: "FOG",
    questions: [
      { id: "q_fog", type: "dropdown", label: "Grease measured", required: true, options: [{ id: "o0", label: "0% – Compliant" }] },
      { id: "q_gone", type: "short_text", label: "Old question", required: false },
    ],
  }],
};
const v2: FormDefinition = {
  sections: [{
    id: "s", title: "FOG",
    questions: [
      { id: "q_fog", type: "dropdown", label: "Grease/Solids Measured", required: true, options: [{ id: "o0", label: "0% – Compliant" }, { id: "o25", label: "25%" }] },
      { id: "q_new", type: "long_text", label: "Technician notes", required: false },
    ],
  }],
};

const row = (over: Partial<CsvSubmission> = {}): CsvSubmission => ({
  submittedAt: new Date("2026-09-15T18:30:00Z"),
  status: "submitted",
  submittedByName: "Tech One",
  taskTitle: "Visit",
  projectName: "Service Visits",
  companyName: "Taqueria",
  personName: "Manager",
  version: 2,
  answers: { q_fog: "o0" },
  fileUrl: (id) => `https://app.erp.io/pm/api/pm/form-submissions/sub/files/${id}`,
  submissionUrl: "https://app.erp.io/pm/forms/submissions/sub",
  ...over,
});

describe("CSV columns", () => {
  it("keeps the current form's order and appends questions only older versions had", () => {
    expect(buildColumns(v2, [v1]).map((c) => c.id)).toEqual(["q_fog", "q_new", "q_gone"]);
  });

  it("uses the newest known label for a question that was renamed", () => {
    expect(buildColumns(v2, [v1]).find((c) => c.id === "q_fog")!.label).toBe("Grease/Solids Measured");
  });
});

describe("toCsv", () => {
  const columns = buildColumns(v2, [v1]);
  const defFor = (v: number) => (v === 1 ? v1 : v2);

  it("resolves an old answer against the version it was given in", () => {
    const csv = toCsv(columns, [row({ version: 1, answers: { q_fog: "o0", q_gone: "legacy value" } })], defFor);
    const line = csv.trim().split("\r\n")[1]!;
    expect(line).toContain("0% – Compliant");
    expect(line).toContain("legacy value");
  });

  it("writes photo columns as links, one per file", () => {
    const withPhotos: FormDefinition = { sections: [{ id: "s", title: "s", questions: [{ id: "q_photos", type: "images", label: "Photos", required: false }] }] };
    const cols = buildColumns(withPhotos, []);
    const csv = toCsv(cols, [row({ answers: { q_photos: ["f1", "f2"] } })], () => withPhotos);
    expect(csv).toContain("files/f1 https://app.erp.io/pm/api/pm/form-submissions/sub/files/f2");
  });

  it("starts with a BOM so Excel reads the Spanish labels as UTF-8", () => {
    expect(toCsv(columns, [row()], defFor).startsWith("﻿")).toBe(true);
  });
});

describe("cell", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(cell('a,b')).toBe('"a,b"');
    expect(cell('say "hi"')).toBe('"say ""hi"""');
    expect(cell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("defuses a formula a technician typed into a notes field", () => {
    expect(cell("=1+1")).toBe("'=1+1");
    expect(cell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(cell("-2+3")).toBe("'-2+3");
  });

  it("leaves ordinary text alone", () => {
    expect(cell("Grease Trap Hydrojetting")).toBe("Grease Trap Hydrojetting");
  });
});

describe("PDF text", () => {
  it("keeps Spanish accents, which WinAnsi can encode", () => {
    // The middot is inside WinAnsi too, so the whole string survives unchanged.
    expect(winAnsi("Limpieza con vapor de pisos de cocina · Notas del técnico ñ ü é"))
      .toBe("Limpieza con vapor de pisos de cocina · Notas del técnico ñ ü é");
  });

  it("replaces characters the standard fonts cannot encode instead of throwing", () => {
    expect(winAnsi("temp ≥ 25% 🙂")).toBe("temp ? 25% ??");
  });

  it("normalises smart quotes a phone keyboard inserts", () => {
    expect(winAnsi("“done” — it’s fine…")).toBe('"done" - it\'s fine...');
  });

  it("wraps to the given width and hard-breaks an unbreakable string", () => {
    const font = { widthOfTextAtSize: (t: string, size: number) => t.length * size * 0.5 } as never;
    // This font measures 5pt per character at size 10, so 40pt fits 8 characters.
    expect(wrapText("aaa bbb ccc ddd", font, 10, 40)).toEqual(["aaa bbb", "ccc ddd"]);
    expect(wrapText("aaa bbb ccc ddd", font, 10, 20)).toEqual(["aaa", "bbb", "ccc", "ddd"]);
    const long = wrapText("x".repeat(30), font, 10, 40);
    expect(long.length).toBeGreaterThan(1);
    expect(long.join("")).toBe("x".repeat(30));
  });

  it("keeps explicit line breaks", () => {
    const font = { widthOfTextAtSize: (t: string) => t.length } as never;
    expect(wrapText("one\ntwo", font, 1, 100)).toEqual(["one", "two"]);
  });
});
