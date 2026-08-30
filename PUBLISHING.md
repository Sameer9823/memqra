# Publishing

This is an npm workspaces monorepo of independently-publishable
`@memorie/*` packages plus a private root (`memorie`, `"private": true`,
never published itself). This doc is for whoever publishes it.

## Before you publish anything

**Run the suite locally first — and re-run it after any further
changes.** As of this stabilization pass, `npm ci` (clean install),
`npm run lint`, `npm run typecheck`, `npm test` (all 197 tests, across
all 26 test files, including `@memorie/storage-postgres` and
`@memorie/cache-redis` run against live local PostgreSQL 16 / Redis 7
instances), and `npm run build` (all 11 packages) have all been run
end-to-end and are green. `npm pack --dry-run` was also run in every
package and confirmed only `dist/` + `package.json` (+ the files field
contents) ship — no `node_modules`, test files, or source maps beyond
the declared `dist` output leak into the tarball.

The one issue found and fixed: `package-lock.json` was out of sync
with the workspace graph (missing the `@memorie/storage-security`
entries), which made `npm ci` fail with an "in sync" error. Root cause
was confirmed to be a real, fully-implemented package that simply
hadn't been captured in a lockfile regeneration — not a stale
reference — so the fix was `npm install --package-lock-only` to
resync it, no source changes.

Before publishing, run it once more yourself to be sure nothing has
drifted since:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

All five should be clean. If `npm test` needs a live PostgreSQL/Redis
to exercise `@memorie/storage-postgres`/`@memorie/cache-redis` fully,
see `.github/workflows/ci.yml` for how to stand those up locally
(e.g. via Docker) — those tests are written to skip gracefully without
a live instance, but you want them actually run at least once before a
release.

## Fill in placeholder metadata

Every package's `package.json` currently has `"author": "Memorie
Contributors"` and `"license": "MIT"` but no `"repository"` or
`"homepage"` field — those weren't added because guessing your actual
GitHub org/repo URL would have been fabrication. Before publishing,
add to each `packages/*/package.json` (and the root):

```json
"repository": {
  "type": "git",
  "url": "git+https://github.com/<your-org>/memorie.git",
  "directory": "packages/<package-name>"
},
"homepage": "https://github.com/<your-org>/memorie#readme",
"bugs": "https://github.com/<your-org>/memorie/issues"
```

## npm org / scope

Every package publishes under the `@memorie` scope. You'll need to
either own that npm org (`npm org create memorie` if unclaimed, or
verify you have publish rights if it's already yours) or rename the
scope across every `package.json` (`"name"`, and every
`"dependencies"`/`"devDependencies"` entry referencing another
`@memorie/*` package) to one you control, e.g. with:

```bash
grep -rl '@memorie/' packages/*/package.json | xargs sed -i 's/@memorie\//@your-scope\//g'
```

## Publish order

Packages depend on each other (see each `package.json`'s
`dependencies`). Publish in dependency order so each package can
resolve its own dependencies from the registry, not just the local
workspace:

1. `@memorie/types` — no internal dependencies.
2. `@memorie/storage` — depends on `types`.
3. Adapters that depend only on `types`/`storage`:
   `@memorie/storage-memory`, `@memorie/storage-sqlite`,
   `@memorie/storage-postgres`, `@memorie/cache-redis`,
   `@memorie/search-sqlite`, `@memorie/vector-memory`,
   `@memorie/embeddings`.
4. `@memorie/storage-security` — depends on `types` and `storage`.
5. `@memorie/core` — depends on `types` and `storage`, and transitively
   exercises every adapter's interface.

Within a step, order doesn't matter — nothing in step 3 depends on
anything else in step 3.

```bash
npm run build   # once, from the repo root — every package needs its dist/
cd packages/types && npm publish --access public && cd ../..
cd packages/storage && npm publish --access public && cd ../..
# ... repeat per the order above
```

`--access public` is required the first time you publish a scoped
package (`@memorie/*` packages are private-scoped by default on npm
unless you pay for private scoped packages, which isn't what you want
here).

## Versioning

Everything is currently `0.1.0` across every package — this repo has
never had a tagged release. For the first publish, `0.1.0` for every
package is reasonable as-is. After that, decide on independent
versioning (bump only what changed) vs. locked versioning (bump every
package together on every release, like this repo's current uniform
`0.1.0`) — either is fine for a project this size; independent
versioning is more accurate but locked versioning is simpler to reason
about and matches how the packages have been maintained so far (every
`dependencies`/`devDependencies` entry pins an exact `0.1.0`, not a
range — you'll want to switch those to a range like `^0.1.0` if you
move to independent versioning, so a patch bump to `types` doesn't
require republishing every downstream package immediately).

## What's in this release, honestly

See `CHANGELOG.md` for the full breakdown. Phases 1-6, including the
PostgreSQL/Redis parts of Phase 6, and Phase 7 (tracing, redaction,
encryption-at-rest, benchmarks) have all now been verified end-to-end:
clean `npm ci`, lint, typecheck, the full test suite (197/197,
including the Postgres/Redis-backed contract tests against live local
instances), and the build, all green — see the "Before you publish
anything" step above for the exact commands. MongoDB/MySQL/S3/
Elasticsearch/Qdrant/Neo4j adapters are not in this repo at all
(`docs/ADAPTERS.md` explains why) — don't advertise them as supported.
BlobStore is likewise not in this release — treat it as future/
experimental if it comes up.
