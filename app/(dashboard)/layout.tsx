import { requireDashboardUser } from "@/lib/auth-context";
import { signOutAndRedirect } from "@/lib/supabase/logout";
import { relojPruebasHabilitado } from "@/lib/reloj-pruebas";
import { redirect } from "next/navigation";
import { MenuPendientesService } from "@/services/menu-pendientes.service";
import { DashboardShell } from "@/components/layout/DashboardShell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireDashboardUser(redirect);
  const showTestClock = user.rol === "ADMIN" && relojPruebasHabilitado();
  const pendingCollections = await MenuPendientesService.contar().catch(() => null);

  async function logout() {
    "use server";
    await signOutAndRedirect(redirect);
  }

  return (
    <DashboardShell
      email={user.email}
      rol={user.rol}
      onLogout={logout}
      showTestClock={showTestClock}
      pendingCollections={pendingCollections}
    >
      {children}
    </DashboardShell>
  );
}
