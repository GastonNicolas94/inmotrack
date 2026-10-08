import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Iniciar sesión | InmoTrack",
  description: "Ingresá a InmoTrack para gestionar contratos, propiedades, cobros y liquidaciones.",
};

export default function LoginLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
