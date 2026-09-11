import { z } from "zod";

export const invitarUsuarioSchema = z
  .object({
    email: z.string().email(),
    rol: z.enum(["ADMIN", "EMPLEADO", "AUDITOR"]),
    puede_aprobar_liquidaciones: z.boolean().default(false),
    id_propietario: z.number().int().positive().nullable().default(null),
  })
  .refine(
    (input) => input.rol === "EMPLEADO" || !input.puede_aprobar_liquidaciones,
    {
      message: "Solo un EMPLEADO puede aprobar liquidaciones.",
      path: ["puede_aprobar_liquidaciones"],
    },
  );

export type InvitarUsuarioInput = z.infer<typeof invitarUsuarioSchema>;
