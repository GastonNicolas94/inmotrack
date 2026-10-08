import { HttpError } from "@/lib/http-error";
export function assertTrustedOutboundUrl(raw: string, allowedHosts: readonly string[]): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new HttpError("VALIDATION_ERROR", "URL inválida.", 400); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !allowedHosts.includes(url.hostname.toLowerCase())) throw new HttpError("FORBIDDEN", "Destino externo no autorizado.", 403);
  return url;
}
