/**
 * Walks the app as a signed-in coach, against the centre's real data.
 *
 * The point is not that the queries return rows -- that was checked at import.
 * It is that every page renders with 645 students behind it instead of the 81
 * invented ones, because the things that break at that size (the 1000-row cap,
 * a slow join, a name with an apostrophe) break silently.
 *
 * Passwords are read from coach-credentials.txt and never printed.
 */
import fs from "node:fs";
import { createServerClient } from "@supabase/ssr";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";

// --- credentials, read from disk, never logged ------------------------------
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

function credential(role) {
  for (const line of fs.readFileSync("coach-credentials.txt", "utf8").split(/\r?\n/)) {
    const m = line.match(/^(\S+)\s+(\S+@\S+)\s+(\S+)\s+\[(\w+)\]/);
    if (m && (m[1].toLowerCase() === role || m[4] === role)) {
      return { email: m[2], password: m[3] };
    }
  }
  throw new Error(`no credentials for ${role}`);
}

// --- sign in, and keep whatever cookies the SSR client wants to set ---------
async function cookiesFor(role) {
  const jar = new Map();
  const supabase = createServerClient(env.REAL_SUPABASE_URL, env.REAL_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
    },
  });

  const { email, password } = credential(role);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`${role} could not sign in: ${error.message}`);

  return {
    cookie: [...jar].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; "),
    supabase,
  };
}

// --- the walk ---------------------------------------------------------------
let failures = 0;

async function page(label, path, cookie, checks = []) {
  const started = Date.now();
  let res, body;
  try {
    res = await fetch(BASE + path, { headers: { cookie }, redirect: "manual" });
    body = await res.text();
  } catch (e) {
    console.log(`FAIL  ${label.padEnd(34)} ${e.message}`);
    failures++;
    return "";
  }
  const ms = Date.now() - started;

  const problems = [];
  if (res.status !== 200) problems.push(`HTTP ${res.status}${res.headers.get("location") ? ` -> ${res.headers.get("location")}` : ""}`);
  // Next renders an error boundary rather than a 500 for a thrown server component.
  if (/Application error|Internal Server Error|digest&quot;/.test(body)) problems.push("error boundary rendered");
  for (const [what, re] of checks) if (!re.test(body)) problems.push(`missing ${what}`);

  if (problems.length) {
    failures++;
    console.log(`FAIL  ${label.padEnd(34)} ${problems.join("; ")}`);
  } else {
    console.log(`ok    ${label.padEnd(34)} ${String(ms).padStart(5)} ms  ${(body.length / 1024).toFixed(0)} KB`);
  }
  return body;
}

const { cookie: coach, supabase } = await cookiesFor("coach");
const { cookie: admin } = await cookiesFor("admin");

console.log(`\nAgainst ${BASE} -- the centre's real data\n`);

// Signed out, everything redirects to the login page.
const out = await fetch(BASE + "/roster", { redirect: "manual" });
console.log(
  out.status >= 300 && (out.headers.get("location") ?? "").includes("/login")
    ? "ok    signed out -> /login"
    : (failures++, `FAIL  signed out reached /roster (HTTP ${out.status})`),
);

await page("today", "/", coach);
await page("roster", "/roster", coach, [["a student name", /<a [^>]*href="\/students\//]]);
await page("sessions", "/sessions", coach);
await page("curriculum", "/curriculum", coach);
await page("merge (tidy up)", "/roster/merge", coach);
await page("admin (as admin)", "/admin", admin);

// The pages that only exist once there are real rows in the database. Sample
// several students rather than the first one alphabetically, who may well be a
// page nobody ever marked.
const rosterBody = await page("roster again", "/roster", coach);
const studentIds = [...new Set([...rosterBody.matchAll(/href="\/students\/([0-9a-f-]{36})"/g)].map((m) => m[1]))];
console.log(`      ${studentIds.length} students linked from the roster`);

const seen = new Map();
let sampled = 0;
for (const id of [0, 1, 40, 200, 400, 600].map((i) => studentIds[i]).filter(Boolean)) {
  const body = await page(`student ${++sampled} of 6`, `/students/${id}`, coach);
  for (const [, label] of body.matchAll(/aria-label="[^"]*?: (None|Seen once|Seen again|Test|Complete)\. Change\."/g)) {
    seen.set(label, (seen.get(label) ?? 0) + 1);
  }
}
if (seen.size === 0) {
  failures++;
  console.log("FAIL  no markable cells rendered on any sampled student");
} else {
  console.log(`      marks rendered: ${[...seen].map(([l, n]) => `${l} ${n}`).join(", ")}`);
}

const sessionsBody = await page("sessions again", "/sessions", coach);
const upcomingId = (sessionsBody.match(/href="\/sessions\/([0-9a-f-]{36})"/) ?? [])[1];
if (upcomingId) await page("a class not yet taught", `/sessions/${upcomingId}`, coach);
else { failures++; console.log("FAIL  no class link on the sessions page"); }

// The grid only has anything in it once somebody is checked in, and the first
// class on the page is the next one, which nobody has attended yet. Find a
// class that actually happened -- through the coach's own session, so this
// checks their policies as well.
const { data: attended } = await supabase
  .from("attendance")
  .select("session_id")
  .limit(1);

if (!attended?.length) {
  failures++;
  console.log("FAIL  the coach can see no attendance at all");
} else {
  const body = await page("a class that happened", `/sessions/${attended[0].session_id}`, coach);
  const cells = [...body.matchAll(/aria-label="[^"]*?: (None|Seen once|Seen again|Test|Complete)\. Change\."/g)].length;
  const checkedIn = (body.match(/Remove|checked in/gi) ?? []).length;
  if (cells === 0) { failures++; console.log("FAIL  a class with attendance rendered an empty grid"); }
  else console.log(`      ${cells} markable cells, ${checkedIn} check-in controls`);
}

// A coach must not be able to reach the admin page.
const denied = await fetch(BASE + "/admin", { headers: { cookie: coach }, redirect: "manual" });
const deniedBody = denied.status === 200 ? await denied.text() : "";
console.log(
  denied.status !== 200 || /not|admin only|permission/i.test(deniedBody)
    ? `ok    coach at /admin        ${denied.status === 200 ? "shown nothing to press" : `HTTP ${denied.status}`}`
    : (failures++, "FAIL  coach sees the admin page in full"),
);


// --- and does a write actually go through? ----------------------------------
//
// Every write in the app is a server action, and a platform can serve GETs
// perfectly while POSTing to one fails: the body is streamed, the action is
// resolved by id, and the reply is a redirect written into a flight stream.
// None of that is exercised by loading a page.
//
// Sign out is the only action that changes real state and touches no student
// record, and it renders as a plain form -- the no-JavaScript path -- so it is
// what this fires.
{
  const html = await (await fetch(BASE + "/roster", { headers: { cookie: coach } })).text();
  const actionId = (html.match(/name="\$ACTION_ID_([0-9a-f]+)"/) ?? [])[1];

  if (!actionId) {
    failures++;
    console.log("FAIL  no plain server-action form rendered");
  } else {
    const body = new FormData();
    body.append(`$ACTION_ID_${actionId}`, "");
    const res = await fetch(BASE + "/roster", {
      method: "POST",
      headers: { cookie: coach },
      body,
      redirect: "manual",
    });
    const text = await res.text();
    const cleared = (res.headers.getSetCookie?.() ?? []).some((c) => /sb-.*auth-token/.test(c));
    const wentToLogin = /\/login/.test(text) || /\/login/.test(res.headers.get("location") ?? "");

    if (res.status < 400 && cleared && wentToLogin) {
      console.log(`ok    a server action ran            HTTP ${res.status}, signed out`);
    } else {
      failures++;
      console.log(`FAIL  server action did not run     HTTP ${res.status}`);
    }
  }
}

console.log(failures === 0 ? "\nEverything renders.\n" : `\n${failures} problem(s).\n`);
process.exit(failures ? 1 : 0);
