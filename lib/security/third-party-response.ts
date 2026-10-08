import { z } from "zod";
import { HttpError } from "@/lib/http-error";

export async function parseThirdPartyResponse<T>(response: Response, schema: z.ZodType<T>, maxBytes = 262144): Promise<T> {
  if (!response.ok) throw new HttpError("UPSTREAM_ERROR", "Error del proveedor externo.", 502);
  const length = response.headers.get("content-length");
  if (length !== null && Number(length) > maxBytes) throw new HttpError("UPSTREAM_ERROR", "Respuesta externa demasiado grande.", 502);
  const reader = response.body?.getReader();
  if (!reader) throw new HttpError("UPSTREAM_ERROR", "Respuesta externa vacía.", 502);
  const decoder = new TextDecoder("utf-8", {fatal:true});
  let size = 0;
  let body = "";
  try {
    while (true) {
      const {done,value}=await reader.read();
      if(done) break;
      size += value.byteLength;
      if(size>maxBytes) {
        await reader.cancel();
        throw new HttpError("UPSTREAM_ERROR","Respuesta externa demasiado grande.",502);
      }
      body += decoder.decode(value,{stream:true});
    }
    body+=decoder.decode();
  } catch(error) {
    if(error instanceof HttpError) throw error;
    throw new HttpError("UPSTREAM_ERROR","Respuesta externa inválida.",502);
  } finally {reader.releaseLock();}
  let data: unknown;
  try {data=JSON.parse(body);} catch {throw new HttpError("UPSTREAM_ERROR","JSON externo inválido.",502);}
  const validated=schema.safeParse(data);
  if(!validated.success) throw new HttpError("UPSTREAM_ERROR","Formato externo inválido.",502);
  return validated.data;
}
