// Run after `npm run build` from the repo root:
//   node examples/06-hybrid-search/index.mjs
//
// Compares the same query with and without a SearchStore configured, to
// show the "graceful degradation" property: engine.search() always works,
// and a real full-text index just makes keyword relevance better.

import { createMemoryEngine } from "../../packages/core/dist/index.js";
import { InMemoryStore, InMemoryVersionStore } from "../../packages/storage-memory/dist/index.js";
import { SqliteSearchStore } from "../../packages/search-sqlite/dist/index.js";

const notes = [
  {
    type: "note",
    content: "The Q3 revenue report shows strong growth across every region except EMEA.",
    importance: 0.8,
  },
  {
    type: "note",
    content: "Team offsite is scheduled for the second week of October in Austin.",
    importance: 0.3,
  },
  {
    type: "note",
    content: "Customer churn ticked up slightly, mostly among self-serve accounts.",
    importance: 0.7,
  },
];

async function seed(memory) {
  const created = [];
  for (const note of notes) {
    created.push(await memory.add({ namespace: "notes", subjectId: "team_ops", ...note }));
  }
  return created;
}

// --- Without a SearchStore: naive keyword fallback over canonical content ---
const fallbackEngine = createMemoryEngine({
  memoryStore: new InMemoryStore(),
  versionStore: new InMemoryVersionStore(),
});
await seed(fallbackEngine);

console.log("Fallback search (no SearchStore) for 'revenue growth':");
const fallbackResults = await fallbackEngine.search({
  namespace: "notes",
  subjectId: "team_ops",
  query: "revenue growth",
});
for (const r of fallbackResults) {
  console.log(`  [${r.score.toFixed(3)}] (${r.matchedSignals?.join(",")}) ${r.memory.content}`);
}

// --- With a SearchStore: real FTS5 bm25 relevance feeding the same pipeline ---
const searchStore = new SqliteSearchStore(":memory:");
const hybridEngine = createMemoryEngine({
  memoryStore: new InMemoryStore(),
  versionStore: new InMemoryVersionStore(),
  searchStore,
});
await seed(hybridEngine); // engine.add() indexes into searchStore automatically

console.log("\nHybrid search (SqliteSearchStore) for 'revenue growth':");
const hybridResults = await hybridEngine.search({
  namespace: "notes",
  subjectId: "team_ops",
  query: "revenue growth",
});
for (const r of hybridResults) {
  console.log(`  [${r.score.toFixed(3)}] (${r.matchedSignals?.join(",")}) ${r.memory.content}`);
}

searchStore.close();
