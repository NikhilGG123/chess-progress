/**
 * Builds and deploys the centre's own instance to Cloudflare Workers.
 *
 * Its own command, for the same reason apply-to-live.mjs is: `npm run deploy`
 * with an environment variable swapped is how a demo build ends up serving real
 * children's records, or the reverse. This reads REAL_SUPABASE_* and nothing
 * else, so which system you are deploying is decided by which command you type.
 *
 * The app only ever uses the publishable key -- there is no server-side secret
 * to install on the worker. Both values are public by design and are inlined
 * into the build, so this needs no Cloudflare secrets at all.
 *
 *   node scripts/deploy-live.mjs --build     build only, no deploy
 *   node scripts/deploy-live.mjs --preview   run the built worker locally
 *   node scripts/deploy-live.mjs             build and deploy
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const missing = ["REAL_SUPABASE_URL", "REAL_SUPABASE_PUBLISHABLE_KEY"].filter((k) => !env[k]);
if (missing.length) {
  console.error(`.env.local is missing ${missing.join(" and ")}.`);
  process.exit(1);
}

const buildEnv = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: env.REAL_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.REAL_SUPABASE_PUBLISHABLE_KEY,
  // The demo banner and the password hint on the login page. This deployment
  // holds real students, so both must be off.
  NEXT_PUBLIC_DEMO_MODE: "false",
};

const mode = process.argv.includes("--preview")
  ? "preview"
  : process.argv.includes("--build")
    ? "build"
    : "deploy";

console.log(`${mode} -> ${env.REAL_SUPABASE_URL}\n`);

const run = (args) => {
  const result = spawnSync("npx", ["opennextjs-cloudflare", ...args], {
    stdio: "inherit",
    env: buildEnv,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run(["build"]);
if (mode !== "build") run([mode]);
