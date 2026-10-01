#!/usr/bin/env node
/**
 * Fails if any installed package (direct or transitive) uses a copyleft licence we can't ship in a
 * commercial web service (docs/ENGINEERING_RULES.md §3). Run from an app folder after `npm ci`:
 *   node ../scripts/check-licenses.mjs
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const FORBIDDEN = /\b(A?GPL|SSPL|BUSL)\b/i;
const ALLOWED_EXCEPTIONS = /\bLGPL\b/i; // dynamic linking only; acceptable if it ever appears

const offenders = [];
function licenceOf(pkg) {
  if (typeof pkg.license === "string") return pkg.license;
  if (pkg.license?.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type ?? l).join(" OR ");
  return "";
}

function visit(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.name.startsWith("@")) {
      visit(path);
      continue;
    }
    const manifest = join(path, "package.json");
    if (existsSync(manifest)) {
      try {
        const pkg = JSON.parse(readFileSync(manifest, "utf8"));
        const licence = licenceOf(pkg);
        // "X OR Y" with a permissive option is fine: we may choose the permissive one.
        const options = licence.split(/\s+OR\s+/i);
        const allCopyleft = licence && options.every((o) => FORBIDDEN.test(o) && !ALLOWED_EXCEPTIONS.test(o));
        if (allCopyleft) offenders.push(`${pkg.name}@${pkg.version}: ${licence}`);
      } catch {
        // not a real package manifest
      }
    }
    const nested = join(path, "node_modules");
    if (existsSync(nested)) visit(nested);
  }
}

if (!existsSync("node_modules")) {
  console.error("Run from an app folder after installing dependencies.");
  process.exit(2);
}
visit("node_modules");
if (offenders.length) {
  console.error(`Copyleft licences found:\n  ${[...new Set(offenders)].join("\n  ")}`);
  process.exit(1);
}
console.log("Licence check passed: no GPL/AGPL/SSPL/BUSL dependencies.");
