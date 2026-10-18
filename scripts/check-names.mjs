/**
 * Is a real child's name anywhere in the repository?
 *
 * This project's one hard rule is that real students never reach git, and it
 * broke that rule in its own documentation: the example explaining why
 * duplicate pages cannot be merged automatically used the actual children it
 * had been worked out from. Nobody spots that by eye, because the names read
 * as placeholders once you have typed them a few times.
 *
 * So it is checked instead. Every name on the enrolment list, and every
 * surname on it, against every tracked file.
 *
 *   node scripts/check-names.mjs [roster.txt]
 *
 * Exits non-zero if it finds anything. The roster is gitignored, so on a
 * machine without it this reports that and passes -- it cannot check what it
 * cannot see, and should not fail a build for that.
 */
import fs from "node:fs";
import { execSync } from "node:child_process";

const rosterPath = process.argv[2] ?? "roster.txt";

if (!fs.existsSync(rosterPath)) {
  console.log(`No ${rosterPath} here, so there is nothing to check against.`);
  process.exit(0);
}

const roster = fs
  .readFileSync(rosterPath, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

// The generated demo data is excluded: its names are invented by the seed
// script, and a first name colliding with a real one there means nothing.
const tracked = execSync("git ls-files", { encoding: "utf8" })
  .split("\n")
  .filter((file) => file && !file.startsWith("supabase/seed/"));

const contents = new Map();
for (const file of tracked) {
  try {
    contents.set(file, fs.readFileSync(file, "utf8"));
  } catch {
    // Binary, or gone since git listed it. Neither can hold a name.
  }
}

// Full names, and surnames on their own -- "Mistry" alone is still a real
// family, and a comment mentioning one is the thing being looked for.
const needles = new Set();
for (const full of roster) {
  const parts = full.split(/\s+/);
  needles.add(full);
  if (parts.length > 1) needles.add(parts[parts.length - 1]);
}

const escape = (s) => s.replace(/[-.*+?^${}()|[\]\\]/g, "\\$&");
const found = new Map();

for (const needle of needles) {
  // Short tokens are ordinary words as often as they are names.
  if (needle.length < 4) continue;

  const pattern = new RegExp("\\b" + escape(needle) + "\\b");
  for (const [file, text] of contents) {
    if (pattern.test(text)) {
      if (!found.has(needle)) found.set(needle, new Set());
      found.get(needle).add(file);
    }
  }
}

console.log(
  `Checked ${needles.size} names from ${rosterPath} against ${contents.size} files.`,
);

if (found.size === 0) {
  console.log("None of them appear. Safe to publish.");
  process.exit(0);
}

console.log("\nREAL NAMES IN TRACKED FILES:\n");
for (const [needle, files] of found) {
  console.log(`  ${needle}`);
  for (const file of files) console.log(`      ${file}`);
}
console.log(
  "\nReplace these with invented people before pushing anywhere public.",
);
process.exit(1);
