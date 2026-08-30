import type Database from "better-sqlite3";

// `memories_fts` is a *projection*, not canonical data (see docs/ARCHITECTURE.md).
// The `snapshot` column caches the full Memory JSON purely so search results can
// be returned without a round-trip to the canonical MemoryStore; if this table is
// dropped or corrupted it can always be rebuilt by re-indexing from canonical data.
export const CREATE_FTS_TABLE = `
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  id UNINDEXED,
  tenant_id UNINDEXED,
  namespace UNINDEXED,
  subject_id UNINDEXED,
  type UNINDEXED,
  state UNINDEXED,
  importance UNINDEXED,
  confidence UNINDEXED,
  created_at UNINDEXED,
  updated_at UNINDEXED,
  content,
  snapshot UNINDEXED,
  tokenize = 'porter unicode61'
);
`;

export function initSearchSchema(db: Database.Database): void {
  db.exec(CREATE_FTS_TABLE);
}
