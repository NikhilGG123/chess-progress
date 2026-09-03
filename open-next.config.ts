import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * The centre's own deployment runs on Cloudflare Workers rather than Vercel.
 *
 * Not a technical preference: Vercel's free tier is for non-commercial use, and
 * a chess centre that charges for classes is not that. Their instance would sit
 * on a plan it is not entitled to, waiting to be noticed. Cloudflare's free
 * tier has no such condition, and this app is small -- a handful of coaches, a
 * few hundred requests an evening.
 *
 * The public demo stays on Vercel, where invented data genuinely is a personal
 * project.
 *
 * No incremental cache is configured. Every page here is dynamic and per-coach;
 * caching a roster would be caching one coach's view of it.
 */
export default defineCloudflareConfig();
