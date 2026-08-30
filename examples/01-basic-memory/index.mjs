// Run after `npm run build` from the repo root:
//   node examples/01-basic-memory/index.mjs
//
// Demonstrates the most basic CRUD flow. No AI, no vector store, no
// chatbot framing — just memory as infrastructure, per spec section 68's
// instruction that examples must not be Jarvis-shaped.

import { createMemoryEngine } from "../../packages/core/dist/index.js";
import { InMemoryStore, InMemoryVersionStore } from "../../packages/storage-memory/dist/index.js";

const memory = createMemoryEngine({
  memoryStore: new InMemoryStore(),
  versionStore: new InMemoryVersionStore(),
});

const created = await memory.add({
  namespace: "projects",
  subjectId: "project_42",
  type: "fact",
  content: "The build pipeline runs on self-hosted runners.",
  importance: 0.6,
  confidence: 0.9,
});
console.log("created:", created.id, created.content);

const fetched = await memory.get(created.id);
console.log("fetched:", fetched?.content);

const updated = await memory.update(created.id, {
  content: "The build pipeline runs on self-hosted GPU runners.",
});
console.log("updated (v" + updated.version + "):", updated.content);

const count = await memory.count({ namespace: "projects", subjectId: "project_42" });
console.log("count in scope:", count);

await memory.delete(created.id);
console.log("deleted:", (await memory.get(created.id)) === null);
