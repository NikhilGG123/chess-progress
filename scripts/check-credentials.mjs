#!/usr/bin/env node
/**
 * Says which credential is wrong, and how, without printing any of them.
 *
 * The nightly job failed with "Invalid URL" and nothing else -- no variable
 * name, no hint -- which sends you off to inspect four secrets you are not
 * allowed to read. The likely cause was mundane: pasting a whole
 * `NAME=value` line out of .env.local instead of just the value.
 *
 * Run before anything that connects. Exits non-zero if a value is missing or
 * the wrong shape.
 */
import dns from "node:dns/promises";
import fs from "node:fs";
import net from "node:net";

import { projectOf } from "./project-of.mjs";

/**
 * Supabase's direct database hosts (db.<ref>.supabase.co) have AAAA records
 * and no A record. GitHub's hosted runners have no IPv6, so a connection from
 * CI dies with `connect ENETUNREACH <an IPv6 address>` -- which reads like a
 * firewall problem and is really a "this can never work" problem.
 *
 * The fix is the pooler host, which is reachable over IPv4. Checked here
 * because DNS resolves fine in CI even though the socket cannot open, so this
 * is diagnosable a step earlier than the connection attempt.
 */
async function reachable(host, port) {
  const socket = new net.Socket();
  return new Promise((resolve) => {
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(8000);
    socket.once("connect", () => done({ ok: true }));
    socket.once("timeout", () => done({ ok: false, code: "ETIMEDOUT" }));
    socket.once("error", (error) => done({ ok: false, code: error.code }));
    socket.connect(port, host);
  });
}

/** Only interesting once a connection has failed: why it could not work. */
async function addressKinds(host) {
  const [v4, v6] = await Promise.all([
    dns.resolve4(host).catch(() => []),
    dns.resolve6(host).catch(() => []),
  ]);
  return { v4: v4.length > 0, v6: v6.length > 0 };
}

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const at = line.indexOf("=");
  if (at > 0) env[line.slice(0, at).trim()] = line.slice(at + 1).trim();
}

let bad = false;
const projects = {};

for (const name of ["SUPABASE_DB_URL", "REAL_SUPABASE_DB_URL"]) {
  const value = env[name] ?? "";

  if (!value) {
    console.error(`${name}: empty — is the secret set?`);
    bad = true;
    continue;
  }

  try {
    const url = new URL(value);
    // Host is masked: these logs are readable by anyone with repository access,
    // and the project id is deliberately not published.
    console.log(
      `${name}: ok — ${url.protocol}//${url.username}@***` +
        (url.password ? "  (carries a password it does not need)" : ""),
    );

    projects[name] = projectOf(url);
    const port = Number(url.port || 5432);
    const result = await reachable(url.hostname, port);

    if (result.ok) {
      console.log(`  reachable on port ${port}`);
    } else {
      const { v4, v6 } = await addressKinds(url.hostname);
      console.error(`  cannot reach it on port ${port} (${result.code}).`);
      if (!v4 && v6) {
        console.error(
          "  The host has an IPv6 address and no IPv4 one, and this",
        );
        console.error(
          "  machine has no IPv6 route. Use the Supabase pooler host:",
        );
        console.error(
          "  Dashboard -> Connect -> Session pooler. Note its user is",
        );
        console.error("  postgres.<project-ref>, not plain postgres.");
      } else if (!v4 && !v6) {
        console.error("  It does not resolve at all -- check the hostname.");
      }
      bad = true;
    }
  } catch {
    console.error(
      `${name}: not a URL. ${value.length} characters, starts ${JSON.stringify(
        value.slice(0, 12),
      )}.`,
    );
    if (value.startsWith(`${name}=`)) {
      console.error(
        `  It begins with "${name}=" — paste only the value, not the whole line.`,
      );
    }
    bad = true;
  }
}

for (const name of ["SUPABASE_DB_PASSWORD", "REAL_SUPABASE_DB_PASSWORD"]) {
  const value = env[name] ?? "";

  if (!value) {
    console.error(`${name}: empty — is the secret set?`);
    bad = true;
  } else if (value.startsWith("postgres")) {
    // The exact mistake made once already, on a laptop rather than in CI.
    console.error(`${name}: looks like a connection string, not a password.`);
    bad = true;
  } else if (value.startsWith(`${name}=`)) {
    console.error(`${name}: begins with "${name}=" — paste only the value.`);
    bad = true;
  } else {
    console.log(`${name}: ok — ${value.length} characters`);
  }
}

// The mistake that a green tick would otherwise hide. Both URLs pointing at
// the same project means the centre's nightly backup is a copy of the demo --
// 86 invented students where 645 real ones should be, filed for ninety days
// under a name that says otherwise.
if (
  projects.SUPABASE_DB_URL &&
  projects.SUPABASE_DB_URL === projects.REAL_SUPABASE_DB_URL
) {
  console.error("");
  console.error(`Both URLs point at project ${projects.REAL_SUPABASE_DB_URL}.`);
  console.error("One of them is wrong:");
  console.error("  SUPABASE_DB_URL      -> the demo");
  console.error("  REAL_SUPABASE_DB_URL -> the centre's own project");
  bad = true;
}

process.exit(bad ? 1 : 0);
