export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}****@${domain}`;
}

export function maskDni(dni: string): string {
  if (dni.length <= 4) return "****";
  return `${dni.slice(0, 2)}****${dni.slice(-2)}`;
}

export function maskCbu(cbu: string): string {
  return `${cbu.slice(0, 3)}****${cbu.slice(-4)}`;
}

export function maskTelefono(tel: string): string {
  return `****${tel.slice(-4)}`;
}

// Aplica masking sobre un objeto si el rol es AUDITOR
export function aplicarMasking(
  obj: Record<string, unknown>,
  rol: string
): Record<string, unknown> {
  if (rol !== "AUDITOR") return obj;
  const masked = { ...obj };
  if (typeof masked.email === "string") masked.email = maskEmail(masked.email);
  if (typeof masked.dni_cuit === "string") masked.dni_cuit = maskDni(masked.dni_cuit);
  if (typeof masked.cbu === "string") masked.cbu = maskCbu(masked.cbu);
  if (typeof masked.telefono === "string") masked.telefono = maskTelefono(masked.telefono);
  return masked;
}
