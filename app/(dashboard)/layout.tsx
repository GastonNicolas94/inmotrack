import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { DashboardShell } from "@/components/layout/DashboardShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rol = (session.user as any)?.rol as string;

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <DashboardShell email={session.user?.email ?? ""} rol={rol} onLogout={logout}>
      {children}
    </DashboardShell>
  );
}
