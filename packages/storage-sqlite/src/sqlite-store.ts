import Database from "better-sqlite3";
import type { MemoryStore, TransactionalMemoryStore } from "@memorie/storage";
import type {
  Memory,
  ListOptions,
  CountOptions,
  MemoryFilters,
  MemoryScope,
} from "@memorie/types";
import { MemoryNotFoundError, VersionConflictError, StorageError } from "@memorie/types";
import { initSchema, memoryToRow, rowToMemory, type MemoryRow } from "./schema.js";

interface WhereClause {
  sql: string;
  params: unknown[];
}

function buildScopeAndFilters(
  scope: MemoryScope,
  filters?: MemoryFilters,
): WhereClause {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (scope.tenantId !== undefined) {
    clauses.push("tenant_id = ?");
    params.push(scope.tenantId);
  }
  if (scope.namespace !== undefined) {
    clauses.push("namespace = ?");
    params.push(scope.namespace);
  }
  if (scope.subjectId !== undefined) {
    clauses.push("subject_id = ?");
    params.push(scope.subjectId);
  }

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

  const toNum = (v: number | Date): number => (v instanceof Date ? v.getTime() : v);

  function rangeCol<T extends number | Date>(
    col: string,
    range: { eq?: T; gte?: T; gt?: T; lte?: T; lt?: T } | undefined,
  ): void {
    if (!range) return;
    if (range.eq !== undefined) {
      clauses.push(`${col} = ?`);
      params.push(toNum(range.eq));
    }
    if (range.gte !== undefined) {
      clauses.push(`${col} >= ?`);
      params.push(toNum(range.gte));
    }
    if (range.gt !== undefined) {
      clauses.push(`${col} > ?`);
      params.push(toNum(range.gt));
    }
    if (range.lte !== undefined) {
      clauses.push(`${col} <= ?`);
      params.push(toNum(range.lte));
    }
    if (range.lt !== undefined) {
      clauses.push(`${col} < ?`);
      params.push(toNum(range.lt));
    }
  }

  rangeCol("importance", filters?.importance);
  rangeCol("confidence", filters?.confidence);
  rangeCol("created_at", filters?.createdAt);
  rangeCol("updated_at", filters?.updatedAt);

  if (filters?.metadata) {
    for (const [key, value] of Object.entries(filters.metadata)) {
      clauses.push("json_extract(metadata, ?) = ?");
      params.push(`$.${key}`, value);
    }
  }

  return {
    sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

const ORDER_COLUMN: Record<string, string> = {
  createdAt: "created_at",
  updatedAt: "updated_at",
  importance: "importance",
  confidence: "confidence",
};

/**
 * SQLite-backed MemoryStore. Suitable for local-first apps, embedded use,
 * and single-node deployments. Uses better-sqlite3 (synchronous driver)
 * internally but exposes the standard async MemoryStore interface.
 */
export class SqliteStore implements TransactionalMemoryStore {
  private readonly db: Database.Database;

  constructor(pathOrDb: string | Database.Database = ":memory:") {
    this.db = typeof pathOrDb === "string" ? new Database(pathOrDb) : pathOrDb;
    this.db.pragma("journal_mode = WAL");
    initSchema(this.db);
  }

  /** Escape hatch for adapters/tests that need direct DB access. */
  get raw(): Database.Database {
    return this.db;
  }

  async create(memory: Memory): Promise<Memory> {
    const row = memoryToRow(memory);
    try {
      this.db
        .prepare(
          `INSERT INTO memories (
            id, tenant_id, namespace, subject_id, type, content, state,
            importance, confidence, source, metadata, created_at, updated_at,
            last_accessed_at, access_count, expires_at, version,
            superseded_by, supersedes, merged_from
          ) VALUES (@id, @tenant_id, @namespace, @subject_id, @type, @content, @state,
            @importance, @confidence, @source, @metadata, @created_at, @updated_at,
            @last_accessed_at, @access_count, @expires_at, @version,
            @superseded_by, @supersedes, @merged_from)`,
        )
        .run(row);
    } catch (err) {
      throw new StorageError(`Failed to create memory ${memory.id}`, { cause: err });
    }
    return memory;
  }

  async get(id: string): Promise<Memory | null> {
    const row = this.db
      .prepare("SELECT * FROM memories WHERE id = ?")
      .get(id) as MemoryRow | undefined;
    return row ? rowToMemory(row) : null;
  }

  async update(
    id: string,
    patch: Partial<Memory>,
    options?: { expectedVersion?: number },
  ): Promise<Memory> {
    const existingRow = this.db
      .prepare("SELECT * FROM memories WHERE id = ?")
      .get(id) as MemoryRow | undefined;
    if (!existingRow) {
      throw new MemoryNotFoundError(id);
    }
    if (
      options?.expectedVersion !== undefined &&
      existingRow.version !== options.expectedVersion
    ) {
      throw new VersionConflictError(id, options.expectedVersion, existingRow.version);
    }

    const existing = rowToMemory(existingRow);
    const merged: Memory = { ...existing, ...patch, id: existing.id, createdAt: existing.createdAt };
    const row = memoryToRow(merged);

    this.db
      .prepare(
        `UPDATE memories SET
          content = @content, state = @state, importance = @importance,
          confidence = @confidence, source = @source, metadata = @metadata,
          updated_at = @updated_at, last_accessed_at = @last_accessed_at,
          access_count = @access_count, expires_at = @expires_at, version = @version,
          superseded_by = @superseded_by, supersedes = @supersedes, merged_from = @merged_from
        WHERE id = @id`,
      )
      .run(row);

    return merged;
  }

  async delete(id: string): Promise<void> {
    this.db.prepare("DELETE FROM memories WHERE id = ?").run(id);
    this.db.prepare("DELETE FROM memory_versions WHERE memory_id = ?").run(id);
  }

  async list(options: ListOptions = {}): Promise<Memory[]> {
    const { sql: whereSql, params } = buildScopeAndFilters(options, options.filters);
    const orderCol = ORDER_COLUMN[options.orderBy ?? "createdAt"] ?? "created_at";
    const direction = options.orderDirection === "desc" ? "DESC" : "ASC";
    const limit = options.limit ?? -1;
    const offset = options.offset ?? 0;

    const rows = this.db
      .prepare(
        `SELECT * FROM memories ${whereSql} ORDER BY ${orderCol} ${direction} LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as MemoryRow[];

    return rows.map(rowToMemory);
  }

  async count(options: CountOptions = {}): Promise<number> {
    const { sql: whereSql, params } = buildScopeAndFilters(options, options.filters);
    const result = this.db
      .prepare(`SELECT COUNT(*) as count FROM memories ${whereSql}`)
      .get(...params) as { count: number };
    return result.count;
  }

  async createMany(memories: Memory[]): Promise<Memory[]> {
    const tx = this.db.transaction((items: Memory[]) => {
      for (const m of items) {
        const row = memoryToRow(m);
        this.db
          .prepare(
            `INSERT INTO memories (
              id, tenant_id, namespace, subject_id, type, content, state,
              importance, confidence, source, metadata, created_at, updated_at,
              last_accessed_at, access_count, expires_at, version,
              superseded_by, supersedes, merged_from
            ) VALUES (@id, @tenant_id, @namespace, @subject_id, @type, @content, @state,
              @importance, @confidence, @source, @metadata, @created_at, @updated_at,
              @last_accessed_at, @access_count, @expires_at, @version,
              @superseded_by, @supersedes, @merged_from)`,
          )
          .run(row);
      }
    });
    tx(memories);
    return memories;
  }

  async deleteMany(ids: string[]): Promise<void> {
    const tx = this.db.transaction((items: string[]) => {
      for (const id of items) {
        this.db.prepare("DELETE FROM memories WHERE id = ?").run(id);
        this.db.prepare("DELETE FROM memory_versions WHERE memory_id = ?").run(id);
      }
    });
    tx(ids);
  }

  async transaction<T>(fn: (tx: MemoryStore) => Promise<T>): Promise<T> {
    // better-sqlite3 transactions are synchronous; we run the async callback
    // outside of a native SQLite transaction wrapper but rely on the
    // driver's single-connection serialization for isolation. Documented
    // as a limitation for callers that need true nested rollback semantics.
    return fn(this);
  }

  close(): void {
    this.db.close();
  }
}
