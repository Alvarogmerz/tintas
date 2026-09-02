import { requireUser } from "@/lib/auth/guards";
import { DashboardNav } from "@/components/dashboard-nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex flex-1">
      <DashboardNav isAdmin={user.role === "ADMIN"} username={user.username} />
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
