import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AppSwitcher } from "@/components/pm/AppSwitcher";
import { Sidebar } from "@/components/pm/Sidebar";
import { TopBar } from "@/components/pm/TopBar";
import { getCurrentUser } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    const h = await headers();
    const currentUrl = h.get("x-url");
    redirect(currentUrl ? `/sign-in?next=${encodeURIComponent(currentUrl)}` : "/sign-in");
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* Narrow app-switcher strip */}
      <AppSwitcher />
      {/* Main sidebar */}
      <Sidebar user={user} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar user={user} />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
