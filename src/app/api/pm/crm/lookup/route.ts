import { NextRequest, NextResponse } from "next/server";
import { apiUser } from "@/lib/forms/api";
import { crmConfigured, CrmError, lookupCompanies, lookupPeople } from "@/lib/crm/client";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Customer / contact search for the form pickers. The browser calls this; this
 * calls the CRM with a signature naming the caller's organization, so the
 * results can only ever be that organization's records.
 */
export async function GET(req: NextRequest) {
  const { user, res } = await apiUser();
  if (res) return res;
  if (!crmConfigured()) return NextResponse.json({ records: [], configured: false });
  if (!rateLimit(`crm-lookup:${user.id}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Slow down." }, { status: 429 });
  }
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") === "person" ? "person" : "company";
  const q = (sp.get("q") ?? "").slice(0, 200);
  const companyId = (sp.get("companyId") ?? "").slice(0, 64);
  try {
    const records = type === "company"
      ? await lookupCompanies(user.orgId, { q, limit: 20 })
      : await lookupPeople(user.orgId, { q, companyId: companyId || undefined, limit: 20 });
    return NextResponse.json({ records, configured: true });
  } catch (err) {
    const code = err instanceof CrmError ? err.code : "error";
    if (code === "no_linked_crm_workspace") return NextResponse.json({ records: [], configured: true, noWorkspace: true });
    console.warn("[crm lookup]", (err as Error).message);
    return NextResponse.json({ error: "The CRM could not be reached", records: [] }, { status: 503 });
  }
}
