# Contributing

## Principles

1. **No fake implementations.** Never make an adapter method return
   `[]`/`null`/`true` just to satisfy an interface or make a test pass.
   If a capability isn't implemented, don't implement the interface at
   all (or throw `UnsupportedCapabilityError`), and document the gap —
   see `README.md`'s "Roadmap" for the pattern.
2. **Canonical memory is authoritative.** Never make a vector/search/
   graph/cache store the source of truth for anything. They're
   projections; they must be rebuildable from the `MemoryStore`.
3. **Every adapter passes its contract suite.** See `docs/ADAPTERS.md`.
   If you add a `MemoryStore` implementation, wire it into
   `runMemoryStoreContractTests` before calling it done.
4. **Don't hard-code AI/chatbot assumptions into the core.** `@memorie/types`
   and `@memorie/core` must build and fully function with zero AI
   dependencies installed.

## Local development

```bash
npm install
npm run lint        # eslint (flat config, packages/**/*.ts)
npm run typecheck    # tsc -b --force across all package project references
npm test              # vitest, all packages/*/test/**/*.test.ts
npm run build           # tsc -b per package (respects project references)
```

All four must pass before a change is considered done.

## Adding a package

1. Create `packages/<name>/` with `package.json`, `tsconfig.json`
   (extending `../../tsconfig.base.json`), and `src/`.
2. Add it to the root `tsconfig.json` `references` array and to the
   consuming package's `tsconfig.json` `references` if it's a dependency.
3. If it's an adapter, add a `test/` directory that runs the relevant
   contract suite from `@memorie/storage`.
4. Update `docs/ADAPTERS.md` (adapters) or the relevant doc for
   non-adapter packages.
