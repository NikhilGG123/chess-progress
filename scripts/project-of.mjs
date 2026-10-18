/**
 * Which Supabase project a connection points at, whichever way it connects.
 *
 *   pooled: postgres.abcd1234 @ aws-0-us-west-2.pooler.supabase.com
 *   direct: postgres          @ db.abcd1234.supabase.co
 *
 * Its own module because both backup.mjs and check-credentials.mjs need it,
 * and backup.mjs runs a backup the moment it is imported.
 *
 * Reading the host alone stamped every pooled snapshot "pooler" -- the same
 * string for every project, which quietly disarms the guard that stops a demo
 * snapshot being restored over 645 real children.
 */
export function projectOf(url) {
  const user = decodeURIComponent(url.username);
  const dotted = user.match(/^postgres\.(.+)$/);
  if (dotted) return dotted[1];
  return url.hostname.split(".")[1] ?? url.hostname;
}
