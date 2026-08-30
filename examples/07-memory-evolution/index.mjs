// Run after `npm run build` from the repo root:
//   node examples/07-memory-evolution/index.mjs
//
// The canonical example from the design brief (spec section 3): a memory
// evolves across versions without losing what it used to say.

import { createMemoryEngine } from "../../packages/core/dist/index.js";
import { InMemoryStore, InMemoryVersionStore } from "../../packages/storage-memory/dist/index.js";

const memory = createMemoryEngine({
  memoryStore: new InMemoryStore(),
  versionStore: new InMemoryVersionStore(),
});

const v1 = await memory.add({
  namespace: "users",
  subjectId: "user_123",
  type: "preference",
  content: "User prefers TypeScript.",
});

const v2 = await memory.evolve(v1.id, {
  content: "User prefers TypeScript for application development.",
});

const v3 = await memory.evolve(v1.id, {
  content:
    "User prefers TypeScript for application development and Python for data science.",
});

console.log("current state (v" + v3.version + "):", v3.content);

const history = await memory.history(v1.id);
console.log("\nfull evolution history:");
for (const entry of history) {
  console.log(`  v${entry.version} (${entry.changeType}): ${entry.snapshot.content}`);
}
