import { NextResponse } from "next/server";

export function errorResponse(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>
) {
  return NextResponse.json({ error_code: code, message, details }, { status });
}
