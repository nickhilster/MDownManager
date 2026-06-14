use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Tier {
    Free,
    Commercial,
    Nonprofit,
}

impl Default for Tier {
    fn default() -> Self {
        Tier::Free
    }
}

impl std::fmt::Display for Tier {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Tier::Free => write!(f, "free"),
            Tier::Commercial => write!(f, "commercial"),
            Tier::Nonprofit => write!(f, "nonprofit"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Feature {
    AgentApi,
    AutoScan,
    SemanticSearch,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BrandingVariant {
    Free,
    Commercial,
    Nonprofit,
}

impl Default for BrandingVariant {
    fn default() -> Self {
        BrandingVariant::Free
    }
}

/// JWT payload — matches the token issued by the Teambotics backend.
#[derive(Debug, Serialize, Deserialize)]
pub struct LicenseClaims {
    /// "teambotics"
    pub iss: String,
    /// Unix timestamp
    pub iat: i64,
    /// Unix timestamp
    pub exp: i64,
    pub tier: Tier,
    pub features: Vec<Feature>,
    pub branding_variant: BrandingVariant,
    /// Only present for nonprofit tokens
    #[serde(skip_serializing_if = "Option::is_none")]
    pub org_name: Option<String>,
}

/// The resolved license the rest of the app works with.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveLicense {
    pub tier: Tier,
    pub features: Vec<Feature>,
    pub branding_variant: BrandingVariant,
    pub org_name: Option<String>,
    /// Seconds since epoch; None for the implicit free tier (no expiry)
    pub expires_at: Option<i64>,
}

impl ActiveLicense {
    pub fn has_feature(&self, feature: &Feature) -> bool {
        self.features.contains(feature)
    }

    pub fn from_claims(claims: LicenseClaims) -> Self {
        Self {
            tier: claims.tier,
            features: claims.features,
            branding_variant: claims.branding_variant,
            org_name: claims.org_name,
            expires_at: Some(claims.exp),
        }
    }
}
