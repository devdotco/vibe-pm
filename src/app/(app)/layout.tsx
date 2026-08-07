import { Sidebar } from "@/components/pm/Sidebar";
import { TopBar } from "@/components/pm/TopBar";
import { requireUser } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
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
