const MAX_REQUEST_ID_LENGTH = 128;

export function getOrCreateRequestId(headers: Headers): string {
  const incoming = headers.get("x-request-id")?.trim();
  if (incoming && incoming.length <= MAX_REQUEST_ID_LENGTH) {
    return incoming;
  }
  return crypto.randomUUID();
}
