import { describe, it, expect } from "vitest";
import { generateKeyPair, exportPKCS8, exportSPKI, importSPKI, jwtVerify } from "jose";
import worker from "./index";
import type { Env } from "./types";

async function makeEnv(): Promise<Env> {
  const { privateKey, publicKey } = await generateKeyPair("RS256", { modulusLength: 2048 });
  return {
    RSA_PRIVATE_KEY_PEM: await exportPKCS8(privateKey),
    RSA_PUBLIC_KEY_PEM: await exportSPKI(publicKey),
    ADMIN_SECRET: "test-secret-abc",
  };
}

function makeRequest(
  path: string,
  options: { method?: string; body?: unknown; secret?: string } = {}
): Request {
  const { method = "POST", body, secret = "test-secret-abc" } = options;
  return new Request(`https://example.com${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("POST /issue", () => {
  it("returns 401 with wrong secret", async () => {
    const env = await makeEnv();
    const req = makeRequest("/issue", { body: { tier: "commercial" }, secret: "wrong" });
    const res = await worker.fetch(req, env, {} as ExecutionContext);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid tier", async () => {
    const env = await makeEnv();
    const req = makeRequest("/issue", { body: { tier: "free" } });
    const res = await worker.fetch(req, env, {} as ExecutionContext);
    expect(res.status).toBe(400);
  });

  it("issues a valid commercial token", async () => {
    const env = await makeEnv();
    const req = makeRequest("/issue", { body: { tier: "commercial" } });
    const res = await worker.fetch(req, env, {} as ExecutionContext);
    expect(res.status).toBe(200);

    const { token } = await res.json<{ token: string }>();
    expect(typeof token).toBe("string");

    const pubKey = await importSPKI(env.RSA_PUBLIC_KEY_PEM, "RS256");
    const { payload } = await jwtVerify(token, pubKey, {
      issuer: "teambotics",
      algorithms: ["RS256"],
    });
    expect(payload.tier).toBe("commercial");
    expect(payload.features).toContain("agent_api");
  });

  it("issues a valid nonprofit token with org_name", async () => {
    const env = await makeEnv();
    const req = makeRequest("/issue", {
      body: { tier: "nonprofit", org_name: "Doctors Without Borders" },
    });
    const res = await worker.fetch(req, env, {} as ExecutionContext);
    expect(res.status).toBe(200);

    const { token } = await res.json<{ token: string }>();
    const pubKey = await importSPKI(env.RSA_PUBLIC_KEY_PEM, "RS256");
    const { payload } = await jwtVerify(token, pubKey, { issuer: "teambotics" });
    expect(payload.tier).toBe("nonprofit");
    expect(payload.org_name).toBe("Doctors Without Borders");
  });
});

describe("GET /public-key", () => {
  it("returns the public key PEM", async () => {
    const env = await makeEnv();
    const req = new Request("https://example.com/public-key", { method: "GET" });
    const res = await worker.fetch(req, env, {} as ExecutionContext);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("-----BEGIN PUBLIC KEY-----");
  });
});

describe("unknown routes", () => {
  it("returns 404", async () => {
    const env = await makeEnv();
    const req = new Request("https://example.com/unknown", { method: "GET" });
    const res = await worker.fetch(req, env, {} as ExecutionContext);
    expect(res.status).toBe(404);
  });
});
