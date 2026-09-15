import { NextResponse } from "next/server";
import { crmConfigured, CrmError, lookupCompanies, lookupPeople } from "@/lib/crm/client";

export interface CrmRefs {
  companyId: string | null;
  companyName: string | null;
  personId: string | null;
  personName: string | null;
  personEmail: string | null;
}

/**
 * Turn CRM ids from a request into verified references with name snapshots.
 *
 * The browser only ever sends ids. Each is looked up through the signed CRM
 * call, which the CRM scopes to THIS organization's tenant — an id from
 * another tenant simply is not found. So a stored reference always points at a
 * record this organization owns, and the names we snapshot are the CRM's, not
 * whatever the client claimed.
 */
export async function resolveCrmRefs(
  orgId: string,
  companyId: string | null,
  personId: string | null,
): Promise<{ ok: true; refs: CrmRefs } | { ok: false; response: NextResponse }> {
  const refs: CrmRefs = { companyId: null, companyName: null, personId: null, personName: null, personEmail: null };
  if (!companyId && !personId) return { ok: true, refs };
  if (!crmConfigured()) {
    return { ok: false, response: NextResponse.json({ error: "The CRM link is not configured on this server" }, { status: 503 }) };
  }
  try {
    if (companyId) {
      const [company] = await lookupCompanies(orgId, { id: companyId, limit: 1 });
      if (!company) return { ok: false, response: NextResponse.json({ error: "Customer not found in the CRM" }, { status: 400 }) };
      refs.companyId = company.id;
      refs.companyName = company.name;
    }
    if (personId) {
      const [person] = await lookupPeople(orgId, { id: personId, limit: 1 });
      if (!person) return { ok: false, response: NextResponse.json({ error: "Contact not found in the CRM" }, { status: 400 }) };
      refs.personId = person.id;
      refs.personName = person.name;
      refs.personEmail = person.email;
      if (!refs.companyId && person.companyId) {
        refs.companyId = person.companyId;
        refs.companyName = person.companyName;
      }
    }
    return { ok: true, refs };
  } catch (err) {
    const noWorkspace = err instanceof CrmError && err.code === "no_linked_crm_workspace";
    return {
      ok: false,
      response: NextResponse.json(
        { error: noWorkspace ? "This organization has no CRM workspace yet" : "The CRM could not be reached. Try again, or start without a customer." },
        { status: noWorkspace ? 400 : 503 },
      ),
    };
  }
}
