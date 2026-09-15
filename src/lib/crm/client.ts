import { createHash, randomUUID } from "node:crypto";
import { SignJWT, importPKCS8, type CryptoKey, type KeyObject } from "jose";

/**
 * Projects → CRM, signed per request.
 *
 * Same contract as marketing-erp's service assertions (lib/integrations/
 * service-assertion.ts there; verified by crm-erp-io src/lib/crm/pm-caller.ts):
 * Projects holds an Ed25519 PRIVATE key (`PM_SERVICE_PRIVATE_KEY`), the CRM
 * holds only the public half. `sub` is the caller's shell organization id — the
 * CRM resolves its tenant from that verified claim and nothing else, so a form
 * in one organization can never read or write another organization's CRM.
 *
 * Each assertion is bound to method + path + body hash, single-use (jti), and
 * lives 60 seconds.
 *
 * Every failure here is soft for the caller: a CRM outage must never lose a
 * technician's submitted form. Callers record the error and retry.
 */

export const PM_SERVICE_ISSUER = "https://app.erp.io/pm";
const SERVICE_JWT_TYPE = "erp-service+jwt";
const TTL_SECONDS = 60;

export function crmBaseUrl(): string {
  return (process.env.CRM_URL || "https://app.erp.io/crm").replace(/\/+$/, "");
}

export function crmConfigured(): boolean {
  return Boolean(process.env.PM_SERVICE_PRIVATE_KEY);
}

export function bodyDigest(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("base64url");
}

function normalizePem(value: string): string {
  return value.replace(/\\+n/g, "\n").trim();
}

let cached: { pem: string; key: Promise<CryptoKey | KeyObject> } | null = null;
function signingKey(): Promise<CryptoKey | KeyObject> {
  const pem = process.env.PM_SERVICE_PRIVATE_KEY;
  if (!pem) throw new CrmError("not_configured", "PM_SERVICE_PRIVATE_KEY is not set");
  if (!cached || cached.pem !== pem) cached = { pem, key: importPKCS8(normalizePem(pem), "EdDSA") };
  return cached.key;
}

export async function signCrmAssertion(
  input: { shellOrgId: string; method: string; path: string; body: string },
  key?: CryptoKey | KeyObject,
): Promise<string> {
  if (!input.shellOrgId?.trim()) throw new CrmError("no_org", "A CRM call needs a shell organization");
  return new SignJWT({ htm: input.method.toUpperCase(), htu: input.path, bdy: bodyDigest(input.body) })
    .setProtectedHeader({ alg: "EdDSA", typ: SERVICE_JWT_TYPE, kid: process.env.PM_SERVICE_KEY_ID ?? "pm-1" })
    .setIssuer(PM_SERVICE_ISSUER)
    .setAudience("crm")
    .setSubject(input.shellOrgId)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(key ?? (await signingKey()));
}

export class CrmError extends Error {
  constructor(readonly code: string, message: string, readonly status?: number) {
    super(message);
  }
}

/** `path` is inside the CRM, without the /crm mount — exactly what the CRM verifies as `htu`. */
async function crmRequest<T>(orgId: string, method: "GET" | "POST", path: string, query?: Record<string, string>, payload?: unknown): Promise<T> {
  const body = payload === undefined ? "" : JSON.stringify(payload);
  const token = await signCrmAssertion({ shellOrgId: orgId, method, path, body });
  const url = new URL(crmBaseUrl() + path);
  for (const [k, v] of Object.entries(query ?? {})) if (v !== "") url.searchParams.set(k, v);

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { authorization: `ErpService ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body || undefined,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new CrmError("unreachable", `CRM unreachable: ${(err as Error).message}`);
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string; code?: string }) | null;
  if (!res.ok || !data) {
    throw new CrmError(data?.code ?? `http_${res.status}`, data?.error ?? `CRM answered ${res.status}`, res.status);
  }
  return data;
}

export interface CrmCompany { type: "company"; id: string; name: string; subtitle: string | null }
export interface CrmPerson {
  type: "person"; id: string; name: string; subtitle: string | null;
  email: string | null; phone: string | null; companyId: string | null; companyName: string | null;
}

export async function lookupCompanies(orgId: string, opts: { q?: string; id?: string; limit?: number }): Promise<CrmCompany[]> {
  const data = await crmRequest<{ records: CrmCompany[] }>(orgId, "GET", "/api/pm-erp/lookup", {
    type: "company", q: opts.q ?? "", id: opts.id ?? "", limit: String(opts.limit ?? 20),
  });
  return data.records;
}

export async function lookupPeople(orgId: string, opts: { q?: string; id?: string; companyId?: string; limit?: number }): Promise<CrmPerson[]> {
  const data = await crmRequest<{ records: CrmPerson[] }>(orgId, "GET", "/api/pm-erp/lookup", {
    type: "person", q: opts.q ?? "", id: opts.id ?? "", companyId: opts.companyId ?? "", limit: String(opts.limit ?? 20),
  });
  return data.records;
}

export interface FormEvent {
  event: "submitted" | "emailed";
  submissionId: string;
  templateId: string;
  templateTitle: string;
  companyId: string | null;
  personId: string | null;
  taskTitle: string | null;
  url: string;
  actorEmail?: string;
  actorName?: string;
  occurredAt: string;
  emailedTo?: string;
}

export async function postFormEvent(orgId: string, event: FormEvent): Promise<{ activityId: string; duplicate: boolean }> {
  return crmRequest(orgId, "POST", "/api/pm-erp/form-events", undefined, event);
}
