import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { authConfig } from "@/auth.config";

// Config completa con Node.js deps — usada por route handlers y server components
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      async authorize(credentials) {
        const { email, password } = credentials as {
          email: string;
          password: string;
        };
        const user = await prisma.usuario.findUnique({ where: { email } });
        if (!user) return null;
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return null;
        return {
          id: String(user.id),
          email: user.email,
          rol: user.rol,
          id_propietario: user.id_propietario,
        };
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
});
