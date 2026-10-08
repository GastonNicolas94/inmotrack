import { HttpError } from "@/lib/http-error";

export async function readBoundedJson(request: Request, maxBytes = 65536): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError("VALIDATION_ERROR", "Cuerpo requerido.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new HttpError("PAYLOAD_TOO_LARGE", "Solicitud demasiado grande.", 413);
      }
      chunks.push(value);
    }
    const buffer = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer)); }
    catch { throw new HttpError("VALIDATION_ERROR", "JSON inválido.", 400); }
  } finally { reader.releaseLock(); }
}
