import type { Env } from "./types";

/**
 * Returns a 401 Response if the request is missing or has a wrong admin secret.
 * Returns null if auth passes.
 */
export function requireAdmin(request: Request, env: Env): Response | null {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || token !== env.ADMIN_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}
