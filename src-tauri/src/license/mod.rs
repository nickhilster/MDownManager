pub mod types;

use anyhow::{anyhow, Result};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use types::{ActiveLicense, BrandingVariant, Feature, LicenseClaims, Tier};

/// RSA-2048 public key used to verify MDownManager license tokens issued by Teambotics.
/// MDownManager uses its own dedicated key pair; the private key lives at
/// ~/.mdownmanager/license_private.pem and is never committed.
/// Regenerate with: python scripts/generate_license_keys.py
const PUBLIC_KEY_PEM: &str = "-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsHC03N0L63zaxiUL95AJ
v6MkSgRO2LUJbawHjaxrMVoMr2vFSSMZEAWzinrQ8QNOQlQlbk2qC78kCo7RwM1Y
/2p9wHxEKB/DUdB4qM7aQfc6FlUVs7wqJw+xTMMz4XkN2kWPOMdt36l7/Q8/g+H2
y+3Gu1RYnVw6NErYNl/XTIk+JHJm96sHG6WssG3YPd3QFBTfEHDmqwlFgGi6GQaQ
Yzickxu5SK2ZpdDgrEtgwe2ATKugbXmp8dlog4En0yCzHvvhoVerJO+UfzIDtpsi
ZI58crTSdctCwPG7XqXpDzt/DARVAe+TddmcBN/GW1sMxuYSVKTs6q8uRRDa+6TR
1QIDAQAB
-----END PUBLIC KEY-----";

pub fn verify_token(token: &str) -> Result<ActiveLicense> {
    let key = DecodingKey::from_rsa_pem(PUBLIC_KEY_PEM.as_bytes())
        .map_err(|e| anyhow!("Invalid public key: {e}"))?;

    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_issuer(&["teambotics"]);
    validation.validate_exp = true;

    let data = decode::<LicenseClaims>(token, &key, &validation)
        .map_err(|e| anyhow!("Token invalid: {e}"))?;

    Ok(ActiveLicense::from_claims(data.claims))
}

pub fn default_free_license() -> ActiveLicense {
    ActiveLicense {
        tier: Tier::Free,
        features: vec![],
        branding_variant: BrandingVariant::Free,
        org_name: None,
        expires_at: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
    use rsa::pkcs8::{EncodePrivateKey, EncodePublicKey, LineEnding};
    use rsa::RsaPrivateKey;
    use types::LicenseClaims;

    fn make_test_keypair() -> (String, String) {
        let mut rng = rand::thread_rng();
        let private_key = RsaPrivateKey::new(&mut rng, 2048).unwrap();
        let priv_pem = private_key
            .to_pkcs8_pem(LineEnding::LF)
            .unwrap()
            .to_string();
        let pub_pem = private_key
            .to_public_key()
            .to_public_key_pem(LineEnding::LF)
            .unwrap();
        (priv_pem, pub_pem)
    }

    fn sign_token(claims: &LicenseClaims, private_pem: &str) -> String {
        let key = EncodingKey::from_rsa_pem(private_pem.as_bytes()).unwrap();
        encode(&Header::new(Algorithm::RS256), claims, &key).unwrap()
    }

    fn commercial_claims(exp: i64) -> LicenseClaims {
        LicenseClaims {
            iss: "teambotics".to_string(),
            iat: 0,
            exp,
            tier: Tier::Commercial,
            features: vec![
                Feature::AgentApi,
                Feature::AutoScan,
                Feature::SemanticSearch,
            ],
            branding_variant: BrandingVariant::Commercial,
            org_name: None,
        }
    }

    /// Verify a valid commercial token is accepted and features parse correctly.
    #[test]
    fn test_valid_commercial_token() {
        let (priv_pem, pub_pem) = make_test_keypair();
        let future_exp = chrono::Utc::now().timestamp() + 86_400;
        let claims = commercial_claims(future_exp);
        let token = sign_token(&claims, &priv_pem);

        // Patch the module-level key for this test by calling the internal decoder directly
        let key = DecodingKey::from_rsa_pem(pub_pem.as_bytes()).unwrap();
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_issuer(&["teambotics"]);
        validation.validate_exp = true;

        let result = decode::<LicenseClaims>(&token, &key, &validation);
        assert!(result.is_ok());
        let active = ActiveLicense::from_claims(result.unwrap().claims);
        assert_eq!(active.tier, Tier::Commercial);
        assert!(active.has_feature(&Feature::AgentApi));
        assert!(active.has_feature(&Feature::AutoScan));
        assert!(active.has_feature(&Feature::SemanticSearch));
    }

    /// Expired tokens must be rejected.
    #[test]
    fn test_expired_token_rejected() {
        let (priv_pem, pub_pem) = make_test_keypair();
        let past_exp = chrono::Utc::now().timestamp() - 120; // 120s in the past, beyond default 60s leeway
        let claims = commercial_claims(past_exp);
        let token = sign_token(&claims, &priv_pem);

        let key = DecodingKey::from_rsa_pem(pub_pem.as_bytes()).unwrap();
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_issuer(&["teambotics"]);
        validation.validate_exp = true;

        let result = decode::<LicenseClaims>(&token, &key, &validation);
        assert!(result.is_err());
    }

    /// Wrong issuer must be rejected.
    #[test]
    fn test_wrong_issuer_rejected() {
        let (priv_pem, pub_pem) = make_test_keypair();
        let mut claims = commercial_claims(chrono::Utc::now().timestamp() + 86_400);
        claims.iss = "evil-corp".to_string();
        let token = sign_token(&claims, &priv_pem);

        let key = DecodingKey::from_rsa_pem(pub_pem.as_bytes()).unwrap();
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_issuer(&["teambotics"]);
        validation.validate_exp = true;

        let result = decode::<LicenseClaims>(&token, &key, &validation);
        assert!(result.is_err());
    }

    /// No token → free license defaults are correct.
    #[test]
    fn test_default_free_license() {
        let license = default_free_license();
        assert_eq!(license.tier, Tier::Free);
        assert!(!license.has_feature(&Feature::AgentApi));
        assert!(license.expires_at.is_none());
    }

    /// Nonprofit token includes org_name.
    #[test]
    fn test_nonprofit_token_includes_org_name() {
        let (priv_pem, pub_pem) = make_test_keypair();
        let claims = LicenseClaims {
            iss: "teambotics".to_string(),
            iat: 0,
            exp: chrono::Utc::now().timestamp() + 86_400,
            tier: Tier::Nonprofit,
            features: vec![Feature::AgentApi, Feature::AutoScan, Feature::SemanticSearch],
            branding_variant: BrandingVariant::Nonprofit,
            org_name: Some("Greenpeace UK".to_string()),
        };
        let token = sign_token(&claims, &priv_pem);

        let key = DecodingKey::from_rsa_pem(pub_pem.as_bytes()).unwrap();
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_issuer(&["teambotics"]);
        validation.validate_exp = true;

        let active = ActiveLicense::from_claims(
            decode::<LicenseClaims>(&token, &key, &validation)
                .unwrap()
                .claims,
        );
        assert_eq!(active.org_name.as_deref(), Some("Greenpeace UK"));
        assert_eq!(active.tier, Tier::Nonprofit);
    }
}
