import { describe, it, expect } from "vitest";
import { signLicenseToken, FULL_FEATURES } from "./token";
import { importSPKI, jwtVerify, generateKeyPair, exportPKCS8, exportSPKI } from "jose";

async function makeTestKeypair(): Promise<{ privatePem: string; publicPem: string }> {
  const { privateKey, publicKey } = await generateKeyPair("RS256", {
    modulusLength: 2048,
  });
  const privatePem = await exportPKCS8(privateKey);
  const publicPem = await exportSPKI(publicKey);
  return { privatePem, publicPem };
}

describe("signLicenseToken", () => {
  it("issues a valid RS256 JWT with correct claims", async () => {
    const { privatePem, publicPem } = await makeTestKeypair();

    const token = await signLicenseToken(
      {
        tier: "commercial",
        features: ["agent_api", "auto_scan", "semantic_search"],
        branding_variant: "commercial",
        duration_days: 365,
      },
      privatePem
    );

    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);

    const pubKey = await importSPKI(publicPem, "RS256");
    const { payload } = await jwtVerify(token, pubKey, {
      issuer: "teambotics",
      algorithms: ["RS256"],
    });

    expect(payload.tier).toBe("commercial");
    expect(payload.features).toEqual(["agent_api", "auto_scan", "semantic_search"]);
    expect(payload.branding_variant).toBe("commercial");
    expect(payload.iss).toBe("teambotics");
    expect(typeof payload.iat).toBe("number");
    expect(typeof payload.exp).toBe("number");
    expect((payload.exp as number) - (payload.iat as number)).toBe(365 * 24 * 60 * 60);
  });

  it("includes org_name for nonprofit tokens", async () => {
    const { privatePem, publicPem } = await makeTestKeypair();

    const token = await signLicenseToken(
      {
        tier: "nonprofit",
        features: FULL_FEATURES,
        branding_variant: "nonprofit",
        duration_days: 365,
        org_name: "Greenpeace UK",
      },
      privatePem
    );

    const pubKey = await importSPKI(publicPem, "RS256");
    const { payload } = await jwtVerify(token, pubKey, { issuer: "teambotics" });

    expect(payload.org_name).toBe("Greenpeace UK");
    expect(payload.tier).toBe("nonprofit");
  });

  it("omits org_name for commercial tokens", async () => {
    const { privatePem, publicPem } = await makeTestKeypair();

    const token = await signLicenseToken(
      {
        tier: "commercial",
        features: FULL_FEATURES,
        branding_variant: "commercial",
        duration_days: 365,
      },
      privatePem
    );

    const pubKey = await importSPKI(publicPem, "RS256");
    const { payload } = await jwtVerify(token, pubKey, { issuer: "teambotics" });

    expect(payload.org_name).toBeUndefined();
  });
});
