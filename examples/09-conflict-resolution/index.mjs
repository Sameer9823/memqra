// Run after `npm run build` from the repo root:
//   node examples/09-conflict-resolution/index.mjs
//
// Demonstrates the Phase 4 evolution pipeline end to end (spec sections
// 7-8, 16-18): ingest() resolves identity, detects duplicates, and -
// when a MemoryIntelligenceProvider is configured - detects genuine
// conflicts and lets you resolve them.

import { createMemoryEngine } from "../../packages/core/dist/index.js";
import {
  InMemoryStore,
  InMemoryVersionStore,
  InMemoryConflictStore,
} from "../../packages/storage-memory/dist/index.js";

// A minimal MemoryIntelligenceProvider. Real deployments would back this
// with an LLM call; here a tiny rule stands in just to show the plumbing
// (the core never assumes or fakes this - see docs/MEMORY-EVOLUTION.md).
const intelligence = {
  async extract() {
    return [];
  },
  async classify() {
    return { type: "fact", confidence: 1 };
  },
  async compare(a, b) {
    if (a.content === b.content) {
      return { relation: "same", confidence: 1 };
    }
    // Both memories share the same metadata.key (that's how they matched
    // identity) but assert different values -> treat as a contradiction.
    return { relation: "contradicts", confidence: 0.9, explanation: "conflicting stated values" };
  },
  async consolidate(memories) {
    return {
      ...memories[0],
      content: memories.map((m) => m.content).join(" "),
    };
  },
};

const conflictStore = new InMemoryConflictStore();
const memory = createMemoryEngine({
  memoryStore: new InMemoryStore(),
  versionStore: new InMemoryVersionStore(),
  conflictStore,
  evolution: { intelligenceProvider: intelligence },
});

const first = await memory.ingest({
  namespace: "users",
  subjectId: "user_123",
  type: "preference",
  content: "preferred_language = TypeScript",
  metadata: { key: "preferred_language" },
});
console.log(`1st ingest -> ${first.outcome}: "${first.memory.content}"`);

const second = await memory.ingest({
  namespace: "users",
  subjectId: "user_123",
  type: "preference",
  content: "preferred_language = Python",
  metadata: { key: "preferred_language" },
});
console.log(`2nd ingest -> ${second.outcome}: "${second.memory.content}"`);

const dup = await memory.ingest({
  namespace: "users",
  subjectId: "user_123",
  type: "preference",
  content: "  preferred_language = Python  ", // same content, incidental whitespace
  metadata: { key: "preferred_language" },
});
console.log(`3rd ingest (near-duplicate of 2nd) -> ${dup.outcome}`);

console.log("\nopen conflicts:", (await conflictStore.list({ status: "open" })).length);

const resolution = await memory.resolveConflict(second.conflict.id, "highest-importance");
console.log(
  `\nresolved conflict via "${resolution.strategy}": winner="${resolution.winner.content}", ` +
    `loser state="${resolution.loser?.state}"`,
);
