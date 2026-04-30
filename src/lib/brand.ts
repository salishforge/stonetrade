/**
 * Brand configuration. The same stonetrade codebase can be deployed under
 * different brand identities (white-label / community / partner deployments).
 * All values come from NEXT_PUBLIC_* env vars so they're available on the
 * server and client without runtime fetches.
 *
 * Defaults fall back to StoneTrade's own brand when no overrides are set.
 *
 * Convention: only NEXT_PUBLIC_BRAND_* env vars belong here. Functional
 * config (database URLs, API keys, etc.) stays in its respective module.
 */

export interface Brand {
  /** Display name in header, page title, and copy. */
  name: string;
  /** Short descriptor used under the masthead and in og:description. */
  tagline: string;
  /** Public path or absolute URL to a logo image. Null hides the logo. */
  logoSrc: string | null;
  /** Optional "powered by X" footer attribution. Null hides it. */
  poweredBy: string | null;
  /** Used in the © footer when distinct from `name`. */
  legalEntity: string;
}

const DEFAULT_BRAND: Brand = {
  name: "StoneTrade",
  tagline: "Price discovery for emerging CCGs",
  logoSrc: null,
  poweredBy: null,
  legalEntity: "StoneTrade",
};

export function getBrand(): Brand {
  const name = process.env.NEXT_PUBLIC_BRAND_NAME?.trim();
  return {
    name: name || DEFAULT_BRAND.name,
    tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE?.trim() || DEFAULT_BRAND.tagline,
    logoSrc: process.env.NEXT_PUBLIC_BRAND_LOGO?.trim() || DEFAULT_BRAND.logoSrc,
    poweredBy: process.env.NEXT_PUBLIC_BRAND_POWERED_BY?.trim() || DEFAULT_BRAND.poweredBy,
    legalEntity:
      process.env.NEXT_PUBLIC_BRAND_LEGAL_ENTITY?.trim() ||
      name ||
      DEFAULT_BRAND.legalEntity,
  };
}
