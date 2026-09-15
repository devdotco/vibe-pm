import { readFile } from "node:fs/promises";
import { generateKeyPair, exportPKCS8, exportSPKI, importSPKI, jwtVerify } from "jose";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { bodyDigest, crmBaseUrl, crmConfigured, PM_SERVICE_ISSUER, signCrmAssertion } from "@/lib/crm/client";
import { FormDefinitionSchema } from "@/lib/forms/definition";
import { renderSubmissionPdf } from "@/lib/forms/pdf";
import { newStorageKey, safeFilename } from "@/lib/storage";
import { parseAttachmentSegment } from "@/lib/attachments";
import { isOrgAdmin } from "@/lib/auth/roles";

describe("CRM service assertions", () => {
  let publicPem = "";
  beforeAll(async () => {
    const { privateKey, publicKey } = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
    process.env.PM_SERVICE_PRIVATE_KEY = await exportPKCS8(privateKey);
    publicPem = await exportSPKI(publicKey);
  });

  it("binds the assertion to one organization, method, path and body", async () => {
    const body = JSON.stringify({ submissionId: "sub-1" });
    const token = await signCrmAssertion({ shellOrgId: "org-abc", method: "POST", path: "/api/pm-erp/form-events", body });
    const { payload, protectedHeader } = await jwtVerify(token, await importSPKI(publicPem, "EdDSA"), {
      issuer: PM_SERVICE_ISSUER,
      audience: "crm",
      typ: "erp-service+jwt",
    });
    expect(protectedHeader.alg).toBe("EdDSA");
    expect(payload.sub).toBe("org-abc");
    expect(payload.htm).toBe("POST");
    expect(payload.htu).toBe("/api/pm-erp/form-events");
    expect(payload.bdy).toBe(bodyDigest(body));
    expect(payload.jti).toBeTruthy();
    expect((payload.exp as number) - (payload.iat as number)).toBeLessThanOrEqual(120);
  });

  it("gives every assertion its own jti, so one cannot be replayed as another", async () => {
    const one = await signCrmAssertion({ shellOrgId: "o", method: "GET", path: "/api/pm-erp/ping", body: "" });
    const two = await signCrmAssertion({ shellOrgId: "o", method: "GET", path: "/api/pm-erp/ping", body: "" });
    const claims = async (t: string) => (await jwtVerify(t, await importSPKI(publicPem, "EdDSA"), { issuer: PM_SERVICE_ISSUER, audience: "crm" })).payload.jti;
    expect(await claims(one)).not.toBe(await claims(two));
  });

  it("refuses to sign without an organization — an unscoped call is the bug itself", async () => {
    await expect(signCrmAssertion({ shellOrgId: "  ", method: "GET", path: "/x", body: "" })).rejects.toThrow(/organization/i);
  });

  it("a body digest changes with the body", () => {
    expect(bodyDigest('{"a":1}')).not.toBe(bodyDigest('{"a":2}'));
    expect(bodyDigest("")).toBe(bodyDigest(""));
  });
});

describe("CRM configuration", () => {
  const saved = process.env.PM_SERVICE_PRIVATE_KEY;
  afterEach(() => { process.env.PM_SERVICE_PRIVATE_KEY = saved; delete process.env.CRM_URL; });

  it("reports itself unconfigured when the key is missing, rather than calling out unsigned", () => {
    delete process.env.PM_SERVICE_PRIVATE_KEY;
    expect(crmConfigured()).toBe(false);
  });

  it("defaults to the CRM's mount and trims a trailing slash", () => {
    expect(crmBaseUrl()).toBe("https://app.erp.io/crm");
    process.env.CRM_URL = "https://app.erp.io/crm/";
    expect(crmBaseUrl()).toBe("https://app.erp.io/crm");
  });
});

describe("storage keys", () => {
  it("leads with the organization and never lets two uploads collide", () => {
    const a = newStorageKey("cmu2yk3ud0000", "forms", "sub-1", "photo.jpg");
    const b = newStorageKey("cmu2yk3ud0000", "forms", "sub-1", "photo.jpg");
    expect(a.startsWith("cmu2yk3ud0000/forms/sub-1/")).toBe(true);
    expect(a).not.toBe(b);
  });

  it("strips path traversal out of a filename", () => {
    // Separators become underscores and the leading dots collapse into one.
    expect(safeFilename("../../etc/passwd")).toBe("__.._etc_passwd");
    expect(safeFilename("")).toBe("file");
    expect(newStorageKey("o", "forms", "s", "../x.jpg")).not.toContain("..");
  });
});

describe("attachment URLs", () => {
  it("reads the attachment id out of a new-style segment", () => {
    const seg = "0f9d4b2a-1c3e-4f5a-8b7c-9d0e1f2a3b4c__site photo.jpg";
    expect(parseAttachmentSegment(seg)).toEqual({ attachmentId: "0f9d4b2a-1c3e-4f5a-8b7c-9d0e1f2a3b4c", filename: "site photo.jpg" });
  });

  it("treats a legacy segment as a bare filename, so links inside old comments still resolve", () => {
    expect(parseAttachmentSegment("report__final.pdf")).toEqual({ attachmentId: null, filename: "report__final.pdf" });
    expect(parseAttachmentSegment("photo.jpg")).toEqual({ attachmentId: null, filename: "photo.jpg" });
  });
});

describe("who may build forms", () => {
  it("accepts the shell's admin roles and its legacy spellings", () => {
    expect(isOrgAdmin({ shellRole: "WORKSPACE_ADMIN" })).toBe(true);
    expect(isOrgAdmin({ shellRole: "SUPER_ADMIN" })).toBe(true);
    expect(isOrgAdmin({ shellRole: "ENTITY_ADMIN" })).toBe(true);
    expect(isOrgAdmin({ shellRole: "PLATFORM_ADMIN" })).toBe(true);
  });

  it("refuses everyone else, including a magic-link account with no shell role", () => {
    expect(isOrgAdmin({ shellRole: "OPERATOR" })).toBe(false);
    expect(isOrgAdmin({ shellRole: null })).toBe(false);
    expect(isOrgAdmin(null)).toBe(false);
  });
});

describe("the Grease Trap form ships valid", () => {
  it("parses against the schema the API enforces", async () => {
    const doc = JSON.parse(await readFile("db/forms/grease-trap-alameda.json", "utf8"));
    const parsed = FormDefinitionSchema.safeParse(doc.definition);
    expect(parsed.success).toBe(true);
    expect(doc.title).toBe("Grease Trap Follow-Up Report | Alameda County");
    const questions = doc.definition.sections.flatMap((s: { questions: unknown[] }) => s.questions);
    expect(doc.definition.sections).toHaveLength(6);
    expect(questions).toHaveLength(11);
    // The nine services in the source checklist, verbatim including the ****** separator.
    const services = questions.find((q: { id: string }) => q.id === "q_additional");
    expect(services.options).toHaveLength(9);
    expect(services.options[0].label).toBe("Interceptor Pumping ****** Bombeo de interceptor de grasa");
  });
});

describe("the report PDF", () => {
  it("renders a real PDF with the customer and the answers on it", async () => {
    const bytes = await renderSubmissionPdf({
      title: "Grease Trap Follow-Up Report | Alameda County",
      organizationName: "North Bay Restaurant Services",
      companyName: "Taquería El Sol",
      personName: "María Pérez",
      submittedAt: new Date("2026-09-15T18:30:00Z"),
      submittedByName: "Tech One",
      taskTitle: "Visit — 09/15",
      definition: {
        sections: [{
          id: "s", title: "FOG Report | Reporte de FOG",
          questions: [
            { id: "q1", type: "dropdown", label: "Grease/Solids Measured", required: true, options: [{ id: "o0", label: "0% – Compliant" }] },
            { id: "q2", type: "checkboxes", label: "Services", required: false, options: [{ id: "a", label: "Interceptor Pumping" }, { id: "b", label: "Hydrojetting" }] },
            { id: "q3", type: "long_text", label: "Notes", required: false },
            { id: "q4", type: "images", label: "Before", required: false },
          ],
        }],
      },
      answers: { q1: "o0", q2: ["a"], q3: "Serviced and left clean.", q4: ["missing-file"] },
      files: new Map(),
    });
    const header = Buffer.from(bytes.slice(0, 5)).toString("latin1");
    expect(header).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it("does not throw on characters outside WinAnsi anywhere in the document", async () => {
    await expect(renderSubmissionPdf({
      title: "Report ≥ 25% 🙂",
      organizationName: "Org ✓",
      companyName: "Café ☕",
      personName: null,
      submittedAt: null,
      submittedByName: null,
      taskTitle: null,
      definition: { sections: [{ id: "s", title: "Sección ✦", questions: [{ id: "q", type: "short_text", label: "Nota → ", required: false }] }] },
      answers: { q: "temperatura ≥ 60°C 🙂" },
      files: new Map(),
    })).resolves.toBeInstanceOf(Uint8Array);
  });
});
