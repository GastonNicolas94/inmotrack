import { requireDashboardUser } from "@/lib/auth-context";
import { signOutAndRedirect } from "@/lib/supabase/logout";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireDashboardUser(redirect);

  async function logout() {
    "use server";
    await signOutAndRedirect(redirect);
  }

  return (
    <DashboardShell email={user.email} rol={user.rol} onLogout={logout}>
      {children}
    </DashboardShell>
  );
}
