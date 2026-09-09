import type { NextAuthConfig } from "next-auth";

// Config Edge-compatible: sin imports de Node.js (pg, bcrypt, prisma)
// Usada SOLO por el middleware para validar JWT
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.rol = (user as any).rol;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.id_propietario = (user as any).id_propietario;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (session.user as any).rol = token.rol;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (session.user as any).id_propietario = token.id_propietario;
      return session;
    },
  },
  providers: [], // Credentials solo se evalúan en Node.js (route handler), no en Edge
};
