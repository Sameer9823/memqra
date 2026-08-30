#!/usr/bin/env node
/**
 * add-metadata.mjs
 *
 * Bulk-inserts "repository", "homepage", and "bugs" fields into every
 * package.json under packages/ (one level deep) in this monorepo,
 * using the correct per-package "directory" value each time.
 *
 * Usage (from the repo root):
 *   node scripts/add-metadata.mjs
 *
 * Safe to re-run: if a package.json already has all three fields set
 * to the expected values, it's left untouched (and reported as
 * "already up to date").
 */

import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

// ---- Config: edit these two if your org/repo ever changes ----
const REPO_URL = "https://github.com/Sameer9823/memqra";
const GIT_URL = `git+${REPO_URL}.git`;
const HOMEPAGE = `https://memqra.vercel.app/`;
const BUGS_URL = `${REPO_URL}/issues`;
// ----------------------------------------------------------------

const PACKAGES_DIR = path.resolve(process.cwd(), "packages");

async function main() {
  let entries;
  try {
    entries = await readdir(PACKAGES_DIR, { withFileTypes: true });
  } catch (err) {
    console.error(
      `Could not read "${PACKAGES_DIR}". Run this from the repo root (where the "packages" folder lives).`
    );
    process.exit(1);
  }

  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  if (dirs.length === 0) {
    console.log("No package directories found under packages/. Nothing to do.");
    return;
  }

  let updated = 0;
  let skipped = 0;
  let errored = 0;

  for (const dir of dirs) {
    const pkgPath = path.join(PACKAGES_DIR, dir, "package.json");

    try {
      await stat(pkgPath);
    } catch {
      console.log(`⚠️  Skipping packages/${dir} (no package.json found)`);
      skipped++;
      continue;
    }

    try {
      const raw = await readFile(pkgPath, "utf8");
      const pkg = JSON.parse(raw);

      const directory = `packages/${dir}`;
      const expectedRepository = {
        type: "git",
        url: GIT_URL,
        directory,
      };

      const alreadyCorrect =
        JSON.stringify(pkg.repository) === JSON.stringify(expectedRepository) &&
        pkg.homepage === HOMEPAGE &&
        pkg.bugs === BUGS_URL;

      if (alreadyCorrect) {
        console.log(`✓  packages/${dir} already up to date`);
        skipped++;
        continue;
      }

      // Rebuild the object so repository/homepage/bugs land in a sensible
      // spot (right after "license"/"author" if present, otherwise near
      // the top) rather than always at the very end.
      const next = {};
      let inserted = false;

      for (const [key, value] of Object.entries(pkg)) {
        // Drop any pre-existing versions of these three keys; we'll
        // re-add them in the right place below.
        if (key === "repository" || key === "homepage" || key === "bugs") {
          continue;
        }

        next[key] = value;

        if (!inserted && (key === "author" || key === "license")) {
          // Insert right after author/license, matching PUBLISHING.md's
          // example layout. If both exist, insert after whichever comes
          // second in the original file.
        }
      }

      // Determine insertion point: after "license" if present, else
      // after "author" if present, else after "description", else top.
      const keys = Object.keys(next);
      let insertAfterKey = null;
      if (keys.includes("license")) insertAfterKey = "license";
      else if (keys.includes("author")) insertAfterKey = "author";
      else if (keys.includes("description")) insertAfterKey = "description";

      const finalPkg = {};
      if (insertAfterKey) {
        for (const [key, value] of Object.entries(next)) {
          finalPkg[key] = value;
          if (key === insertAfterKey) {
            finalPkg.repository = expectedRepository;
            finalPkg.homepage = HOMEPAGE;
            finalPkg.bugs = BUGS_URL;
          }
        }
      } else {
        finalPkg.repository = expectedRepository;
        finalPkg.homepage = HOMEPAGE;
        finalPkg.bugs = BUGS_URL;
        for (const [key, value] of Object.entries(next)) {
          finalPkg[key] = value;
        }
      }

      const output = JSON.stringify(finalPkg, null, 2) + "\n";
      await writeFile(pkgPath, output, "utf8");

      console.log(`✅ Updated packages/${dir}/package.json (directory: ${directory})`);
      updated++;
    } catch (err) {
      console.error(`❌ Failed on packages/${dir}: ${err.message}`);
      errored++;
    }
  }

  console.log("");
  console.log(`Done. ${updated} updated, ${skipped} already fine/skipped, ${errored} errors.`);
  if (updated > 0) {
    console.log("Review the diffs (git diff packages/) before committing.");
  }
}

main();
