import type { Env, IssueRequest } from "./types";
import { requireAdmin } from "./auth";
import { signLicenseToken, FULL_FEATURES } from "./token";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleIssue(request: Request, env: Env): Promise<Response> {
  const authError = requireAdmin(request, env);
  if (authError) return authError;

  let body: IssueRequest;
  try {
    body = await request.json<IssueRequest>();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (body.tier !== "commercial" && body.tier !== "nonprofit") {
    return json({ error: "tier must be 'commercial' or 'nonprofit'" }, 400);
  }

  const duration_days = body.duration_days ?? 365;
  if (!Number.isInteger(duration_days) || duration_days < 1 || duration_days > 3650) {
    return json({ error: "duration_days must be an integer between 1 and 3650" }, 400);
  }

  try {
    const token = await signLicenseToken(
      {
        tier: body.tier,
        features: FULL_FEATURES,
        branding_variant: body.tier,
        duration_days,
        org_name: body.org_name,
      },
      env.RSA_PRIVATE_KEY_PEM
    );
    return json({ token });
  } catch (err) {
    return json({ error: `Signing failed: ${String(err)}` }, 500);
  }
}

function handlePublicKey(env: Env): Response {
  return new Response(env.RSA_PUBLIC_KEY_PEM, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/issue") {
      return handleIssue(request, env);
    }

    if (request.method === "GET" && url.pathname === "/public-key") {
      return handlePublicKey(env);
    }

    return json({ error: "Not found" }, 404);
  },
} satisfies ExportedHandler<Env>;
