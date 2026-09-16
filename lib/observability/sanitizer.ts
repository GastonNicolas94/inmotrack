const DEFAULT_MAX_BYTES = 20 * 1024;

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordconfirmation",
  "authorization",
  "cookie",
  "set-cookie",
  "accesstoken",
  "refreshtoken",
  "access_token",
  "refresh_token",
  "apikey",
  "api_key",
  "secret",
  "token",
  "creditcard",
  "credit_card",
]);

const OMITTED_CONTENT_TYPES = [
  "multipart/form-data",
  "application/octet-stream",
  "application/pdf",
  "image/",
  "audio/",
  "video/",
];

export type SanitizeOptions = {
  maxBytes?: number;
  contentType?: string | null;
};

function normalizeKey(key: string): string {
  return key.replaceAll("-", "").replaceAll("_", "").toLowerCase();
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  for (const candidate of SENSITIVE_KEYS) {
    if (normalizeKey(candidate) === normalized) return true;
  }
  return false;
}

function redact(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== "object") return value;

  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen));
  }

  if (value instanceof Headers) {
    const result: Record<string, unknown> = {};
    for (const [key, headerValue] of value.entries()) {
      result[key] = isSensitiveKey(key) ? "[REDACTED]" : headerValue;
    }
    return result;
  }

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    result[key] = isSensitiveKey(key) ? "[REDACTED]" : redact(child, seen);
  }
  return result;
}

export function sanitizeForLogging(
  value: unknown,
  options: SanitizeOptions = {},
): unknown {
  const contentType = options.contentType?.toLowerCase() ?? "";
  if (OMITTED_CONTENT_TYPES.some((type) => contentType.includes(type))) {
    return { omitted: true, reason: "unsupported_content_type" };
  }

  const sanitized = redact(value, new WeakSet<object>());
  const serialized = JSON.stringify(sanitized);
  if (serialized === undefined) return sanitized;

  const originalSize = Buffer.byteLength(serialized, "utf8");
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  if (originalSize <= maxBytes) return sanitized;

  return {
    truncated: true,
    originalSize,
    preview: Buffer.from(serialized, "utf8").subarray(0, maxBytes).toString("utf8"),
  };
}
