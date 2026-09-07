import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Sidebar, PmRail } from "@/components/pm/Sidebar";
import { AppShell } from "@erp-ui";
import { TopBar } from "@/components/pm/TopBar";
import { getCurrentUser } from "@/lib/auth/session";
import { listShellOrgs } from "@/lib/auth/shell-orgs";
import { loadShellNav } from "@erp-ui/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    const h = await headers();
    const currentUrl = h.get("x-url");
    redirect(currentUrl ? `/sign-in?next=${encodeURIComponent(currentUrl)}` : "/sign-in");
  }

  // No entitlement claim reaches this module, so the rail shows every live
  // application. Per the suite rule, only a real entitlement answer may shrink
  // it — a missing one must not.
  // Best-effort: an unreachable shell collapses the switcher to a label.
  const orgs = await listShellOrgs();

  // White-label chrome and entitlement, both from the shell in one call.

  // Best-effort: brandVars(null) draws the erp.io defaults.

  const { brand, modules } = await loadShellNav();


  return (
    <AppShell
      brand={brand}
      moduleLabel="Projects"
      rail={<PmRail brand={brand} modules={modules} />}
      sidebar={<Sidebar user={user} orgs={orgs} />}
    >
      <TopBar user={user} />
      <main className="flex-1 overflow-auto">{children}</main>
    </AppShell>
  );
}
