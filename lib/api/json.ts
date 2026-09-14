import { NextResponse } from "next/server";

/** JSON response with explicit UTF-8 charset (helps PowerShell / some clients). */
export function jsonUtf8(
  body: unknown,
  init?: { status?: number; headers?: HeadersInit },
): NextResponse {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return NextResponse.json(body, { status: init?.status ?? 200, headers });
}
