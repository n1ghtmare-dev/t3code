#!/usr/bin/env node
// Fork-only: resolves merge conflicts in translation catalogs after merging upstream.
// Takes upstream's catalog and adds back only the keys this fork added (absent from the merge
// base), so upstream's renames and removals win and the fork's own strings survive.
// Usage: node scripts/fork/merge-translations.mjs   (run during a conflicted merge)
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28 });

const conflicted = git("diff", "--name-only", "--diff-filter=U")
  .split("\n")
  .filter((file) => /\/i18n\/translations\/[^/]+\.json$/.test(file));

const stage = (number, file) => {
  try {
    return JSON.parse(git("show", `:${number}:${file}`));
  } catch {
    return {};
  }
};

for (const file of conflicted) {
  const base = stage(1, file);
  const ours = stage(2, file);
  const theirs = stage(3, file);
  const merged = { ...theirs };
  let added = 0;
  for (const [key, value] of Object.entries(ours)) {
    if (key in base || key in merged) continue;
    merged[key] = value;
    added += 1;
  }
  writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`);
  git("add", file);
  console.log(`${file}: upstream catalog + ${added} fork keys`);
}
if (conflicted.length === 0) console.log("No conflicted translation catalogs.");
