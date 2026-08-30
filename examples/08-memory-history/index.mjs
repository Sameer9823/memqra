// Run after `npm run build` from the repo root:
//   node examples/08-memory-history/index.mjs
//
// Demonstrates time-travel queries: "what did we believe at time T?"

import { createMemoryEngine } from "../../packages/core/dist/index.js";
import { InMemoryStore, InMemoryVersionStore } from "../../packages/storage-memory/dist/index.js";

const memory = createMemoryEngine({
  memoryStore: new InMemoryStore(),
  versionStore: new InMemoryVersionStore(),
});

const created = await memory.add({
  namespace: "projects",
  subjectId: "project_42",
  type: "status",
  content: "Status: planning.",
});
const t1 = new Date();

await new Promise((r) => setTimeout(r, 5));
await memory.evolve(created.id, { content: "Status: in progress." });
const t2 = new Date();

await new Promise((r) => setTimeout(r, 5));
await memory.evolve(created.id, { content: "Status: shipped." });

console.log("as of t1:", (await memory.getAt(created.id, t1))?.content);
console.log("as of t2:", (await memory.getAt(created.id, t2))?.content);
console.log("now:", (await memory.get(created.id))?.content);
