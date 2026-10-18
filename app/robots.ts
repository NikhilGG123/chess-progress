import type { MetadataRoute } from "next";

/**
 * Keep the academy's deployment out of search results.
 *
 * There are two deployments of this repository: the public demo, whose students
 * are invented, and the academy's own instance, which holds 645 real children's
 * records. Neither exposes data without a sign-in, but a login page for a
 * children's records system has no business appearing in Google.
 *
 * **Fails closed on purpose.** The rule is "disallow unless this is provably
 * the demo", not "disallow if this is provably live". A missing or misspelled
 * environment variable then costs the demo some search traffic nobody wanted,
 * rather than publishing the academy's front door. The demo is reached from a
 * link on a CV, never from a search.
 */
export default function robots(): MetadataRoute.Robots {
  const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

  return {
    rules: { userAgent: "*", [isDemo ? "allow" : "disallow"]: "/" },
  };
}
