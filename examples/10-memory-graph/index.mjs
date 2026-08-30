// Run after `npm run build` from the repo root:
//   node examples/10-memory-graph/index.mjs
//
// Demonstrates the Phase 5 memory graph (spec sections 27-28): typed
// relationships between memories, multi-hop traversal, and a
// "relationship" signal feeding into the same hybrid search pipeline
// used by 06-hybrid-search.

import { createMemoryEngine } from "../../packages/core/dist/index.js";
import { InMemoryStore, InMemoryVersionStore, InMemoryGraphStore } from "../../packages/storage-memory/dist/index.js";

const memoryStore = new InMemoryStore();
// InMemoryGraphStore only stores relation records; it resolves full
// Memory objects on demand via the function you pass it (typically
// memoryStore.get) - graph projections are never authoritative.
const graphStore = new InMemoryGraphStore((id) => memoryStore.get(id));

const memory = createMemoryEngine({
  memoryStore,
  versionStore: new InMemoryVersionStore(),
  graphStore,
});

const typescript = await memory.add({
  namespace: "docs",
  subjectId: "kb",
  type: "note",
  content: "TypeScript adds static types to JavaScript.",
});
const staticTyping = await memory.add({
  namespace: "docs",
  subjectId: "kb",
  type: "note",
  content: "Static typing catches a class of bugs before runtime.",
});
const testing = await memory.add({
  namespace: "docs",
  subjectId: "kb",
  type: "note",
  content: "Automated tests catch a different class of bugs.",
});
const unrelated = await memory.add({
  namespace: "docs",
  subjectId: "kb",
  type: "note",
  content: "The office coffee machine is on the third floor.",
});

await memory.relate(typescript.id, staticTyping.id, "supports");
await memory.relate(staticTyping.id, testing.id, "related_to");

console.log("--- related() (1 hop, outgoing) ---");
const oneHop = await memory.related(typescript.id, { direction: "outgoing" });
for (const m of oneHop) console.log(`  ${m.content}`);

console.log("\n--- traverse() (2 hops, outgoing) ---");
const twoHops = await memory.traverse(typescript.id, { direction: "outgoing", maxDepth: 2 });
for (const m of twoHops) console.log(`  ${m.content}`);

console.log("\n--- search() with relatedTo (graph signal boosts related notes) ---");
const results = await memory.search({
  namespace: "docs",
  subjectId: "kb",
  relatedTo: typescript.id,
});
for (const r of results) {
  console.log(`  [${r.score.toFixed(2)}] (${r.matchedSignals?.join(",")}) ${r.memory.content}`);
}

console.log(`\n(never surfaced by the graph signal: "${unrelated.content}")`);
