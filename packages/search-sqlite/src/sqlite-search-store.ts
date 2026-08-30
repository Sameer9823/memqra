import Database from "better-sqlite3";
import type { SearchStore } from "@memorie/storage";
import type { Memory, SearchQuery, SearchResult, MemoryFilters } from "@memorie/types";
import { SearchError } from "@memorie/types";
import { initSearchSchema } from "./schema.js";

interface FtsRow {
  id: string;
  snapshot: string;
  rank?: number;
}

function memoryToSnapshotJson(memory: Memory): string {
  return JSON.stringify(memory);
}

function snapshotJsonToMemory(json: string): Memory {
  return JSON.parse(json, (key, value) => {
    if (
      (key === "createdAt" ||
        key === "updatedAt" ||
        key === "lastAccessedAt" ||
        key === "expiresAt") &&
      typeof value === "string"
    ) {
      return new Date(value);
    }
    return value;
  }) as Memory;
}

/** Escapes an FTS5 MATCH query so arbitrary user text can't break query syntax. */
function toFtsMatchQuery(query: string): string {
  const terms = query
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, '""')}"`);
  if (terms.length === 0) {
    throw new SearchError("Empty search query");
  }
  return terms.join(" AND ");
}

function buildFilterClauses(filters?: MemoryFilters): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters?.type) {
    const types = Array.isArray(filters.type) ? filters.type : [filters.type];
    clauses.push(`type IN (${types.map(() => "?").join(",")})`);
    params.push(...types);
  }
  if (filters?.state) {
    const states = Array.isArray(filters.state) ? filters.state : [filters.state];
    clauses.push(`state IN (${states.map(() => "?").join(",")})`);
    params.push(...states);
  }
  // Note: metadata/createdAt/updatedAt/importance/confidence range filtering
  // on the FTS projection is intentionally out of scope for this adapter;
  // apply those via the canonical MemoryStore or the core hybrid pipeline,
  // which re-scores/filters against canonical data. See docs/SEARCH.md.

  return { sql: clauses.length ? `AND ${clauses.join(" AND ")}` : "", params };
}

/**
 * Full-text SearchStore backed by SQLite's FTS5 extension (bm25 ranking,
 * Porter stemming). This is a real, production-usable keyword search
 * implementation — not a stub — but it is a *projection*: canonical data
 * lives in a MemoryStore, and this index can always be rebuilt by
 * re-calling index() for every canonical memory.
 */
export class SqliteSearchStore implements SearchStore {
  private readonly db: Database.Database;

  constructor(pathOrDb: string | Database.Database = ":memory:") {
    this.db = typeof pathOrDb === "string" ? new Database(pathOrDb) : pathOrDb;
    initSearchSchema(this.db);
  }

  get raw(): Database.Database {
    return this.db;
  }

  async index(memory: Memory): Promise<void> {
    // Delete-then-insert: FTS5 doesn't support in-place UPDATE of indexed
    // columns cleanly, and this guarantees re-indexing never duplicates
    // (verified by the SearchStore contract suite).
    this.db.prepare("DELETE FROM memories_fts WHERE id = ?").run(memory.id);
    this.db
      .prepare(
        `INSERT INTO memories_fts
          (id, tenant_id, namespace, subject_id, type, state, importance, confidence, created_at, updated_at, content, snapshot)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        memory.id,
        memory.tenantId ?? null,
        memory.namespace,
        memory.subjectId,
        memory.type,
        memory.state,
        memory.importance,
        memory.confidence,
        memory.createdAt.getTime(),
        memory.updatedAt.getTime(),
        memory.content,
        memoryToSnapshotJson(memory),
      );
  }

  async delete(id: string): Promise<void> {
    this.db.prepare("DELETE FROM memories_fts WHERE id = ?").run(id);
  }

  /** See SearchStore.listIds() — enables engine.reconcile() to check this store. */
  async listIds(): Promise<string[]> {
    const rows = this.db.prepare("SELECT id FROM memories_fts").all() as { id: string }[];
    return rows.map((r) => r.id);
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const scopeClauses: string[] = [];
    const scopeParams: unknown[] = [];
    if (query.tenantId !== undefined) {
      scopeClauses.push("tenant_id = ?");
      scopeParams.push(query.tenantId);
    }
    if (query.namespace !== undefined) {
      scopeClauses.push("namespace = ?");
      scopeParams.push(query.namespace);
    }
    if (query.subjectId !== undefined) {
      scopeClauses.push("subject_id = ?");
      scopeParams.push(query.subjectId);
    }
    const { sql: filterSql, params: filterParams } = buildFilterClauses(query.filters);
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    if (query.query && query.query.trim() !== "") {
      const matchQuery = toFtsMatchQuery(query.query);
      const whereScope = scopeClauses.length ? `AND ${scopeClauses.join(" AND ")}` : "";
      const rows = this.db
        .prepare(
          `SELECT id, snapshot, bm25(memories_fts) as rank
           FROM memories_fts
           WHERE memories_fts MATCH ? ${whereScope} ${filterSql}
           ORDER BY rank
           LIMIT ? OFFSET ?`,
        )
        .all(matchQuery, ...scopeParams, ...filterParams, limit, offset) as FtsRow[];

      return rows.map((row) => {
        // bm25() in SQLite returns *lower is more relevant* (often negative).
        // Flip sign and squash to (0, 1) so scores compose predictably with
        // other ranking signals in the core hybrid pipeline.
        const raw = Math.max(0, -(row.rank ?? 0));
        const score = raw / (raw + 1);
        return {
          memory: snapshotJsonToMemory(row.snapshot),
          score,
          matchedSignals: ["keyword" as const],
        };
      });
    }

    // No free-text query: structured-only lookup against the projection.
    const whereScope = scopeClauses.length ? `WHERE ${scopeClauses.join(" AND ")}` : "";
    const combinedFilterSql = filterSql.replace(/^AND /, whereScope ? "AND " : "WHERE ");
    const rows = this.db
      .prepare(
        `SELECT id, snapshot FROM memories_fts ${whereScope} ${combinedFilterSql}
         ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...scopeParams, ...filterParams, limit, offset) as FtsRow[];

    return rows.map((row) => ({
      memory: snapshotJsonToMemory(row.snapshot),
      score: 1,
      matchedSignals: ["structured" as const],
    }));
  }

  close(): void {
    this.db.close();
  }
}
