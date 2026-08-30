// Run after `npm run build` from the repo root:
//   node examples/03-sqlite/index.mjs
//
// Shows the local-first mode: persistent SQLite storage, no cloud
// service required for basic functionality (spec section 34).

import { createMemoryEngine } from "../../packages/core/dist/index.js";
import { SqliteStore, SqliteVersionStore } from "../../packages/storage-sqlite/dist/index.js";

const store = new SqliteStore(":memory:"); // use a file path for real persistence, e.g. "./memorie.db"
const memory = createMemoryEngine({
  memoryStore: store,
  versionStore: new SqliteVersionStore(store.raw),
});

const doc = await memory.add({
  namespace: "documents",
  subjectId: "doc_9001",
  type: "summary",
  content: "Q3 report: revenue up 12%, churn flat.",
  importance: 0.8,
  confidence: 1.0,
  source: "application",
});
console.log("stored in SQLite:", doc.id);

const evolved = await memory.evolve(doc.id, {
  content: "Q3 report: revenue up 12%, churn flat, EMEA underperforming.",
});
console.log("evolved to version", evolved.version);

const history = await memory.history(doc.id);
console.log(
  "history:",
  history.map((v) => `v${v.version}: ${v.snapshot.content}`),
);

store.close();
