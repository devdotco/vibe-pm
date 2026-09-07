import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Sidebar, PmRail } from "@/components/pm/Sidebar";
import { AppShell } from "@erp-ui";
import { TopBar } from "@/components/pm/TopBar";
import { getCurrentUser } from "@/lib/auth/session";

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
  return (
    <AppShell
      moduleLabel="Projects"
      rail={<PmRail />}
      sidebar={<Sidebar user={user} />}
    >
      <TopBar user={user} />
      <main className="flex-1 overflow-auto">{children}</main>
    </AppShell>
  );
}
