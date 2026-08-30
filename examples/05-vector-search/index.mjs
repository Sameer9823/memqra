// Run after `npm run build` from the repo root:
//   node examples/05-vector-search/index.mjs
//
// Shows semantic search: a VectorStore + EmbeddingProvider feed a
// "semantic" signal into the same hybrid pipeline used elsewhere. The
// embedding provider here is a deterministic, dependency-free hashing
// embedding (@memorie/embeddings) -- not a real ML model -- so this is
// fully offline and has zero AI vendor dependency (spec section 19).
// It captures lexical overlap, not deep meaning; swap in a real
// EmbeddingProvider for production semantic quality.

import { createMemoryEngine } from "../../packages/core/dist/index.js";
import { InMemoryStore, InMemoryVersionStore } from "../../packages/storage-memory/dist/index.js";
import { InMemoryVectorStore } from "../../packages/vector-memory/dist/index.js";
import { HashEmbeddingProvider } from "../../packages/embeddings/dist/index.js";

const memory = createMemoryEngine({
  memoryStore: new InMemoryStore(),
  versionStore: new InMemoryVersionStore(),
  vectorStore: new InMemoryVectorStore(),
  embeddingProvider: new HashEmbeddingProvider(),
});

console.log("capabilities:", memory.capabilities());

await memory.add({
  namespace: "notes",
  subjectId: "team_ops",
  type: "note",
  content: "Quarterly revenue growth beat forecast across every region.",
});
await memory.add({
  namespace: "notes",
  subjectId: "team_ops",
  type: "note",
  content: "The office coffee machine is broken again.",
});
await memory.add({
  namespace: "notes",
  subjectId: "team_ops",
  type: "note",
  content: "Sales figures and revenue trends look strong this quarter.",
});

const results = await memory.search({
  namespace: "notes",
  subjectId: "team_ops",
  query: "revenue and sales performance",
});

console.log("\nsemantic search results for 'revenue and sales performance':");
for (const r of results) {
  console.log(`  [${r.score.toFixed(3)}] (${r.matchedSignals?.join(",")}) ${r.memory.content}`);
}
