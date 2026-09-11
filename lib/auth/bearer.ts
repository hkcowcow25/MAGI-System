import { NextRequest } from "next/server";
import { getMagiApiKey } from "@/lib/config/persona";

export function unauthorizedResponse(message = "Unauthorized"): Response {
  return Response.json(
    { error: { message, type: "invalid_request_error", code: "unauthorized" } },
    { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
  );
}

/**
 * Require Authorization: Bearer <MAGI_API_KEY>.
 * If MAGI_API_KEY is unset, reject all requests (fail closed for cost-triggering routes).
 */
export function requireBearer(req: NextRequest): Response | null {
  const expected = getMagiApiKey();
  if (!expected) {
    return unauthorizedResponse(
      "MAGI_API_KEY is not configured on the server; API access is disabled.",
    );
  }
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match || match[1] !== expected) {
    return unauthorizedResponse("Invalid or missing Bearer token");
  }
  return null;
}
