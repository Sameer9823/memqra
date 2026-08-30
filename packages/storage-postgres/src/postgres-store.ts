import { Pool, type PoolClient } from "pg";
import type { MemoryStore, TransactionalMemoryStore } from "@memorie/storage";
import type { Memory, ListOptions, CountOptions, MemoryFilters, MemoryScope } from "@memorie/types";
import { MemoryNotFoundError, VersionConflictError, StorageError } from "@memorie/types";
import { CREATE_MEMORIES_TABLE, CREATE_VERSIONS_TABLE, memoryToRow, rowToMemory, type MemoryRow } from "./schema.js";

interface WhereClause {
  sql: string;
  params: unknown[];
}

/** Runnable via a Pool or a checked-out PoolClient (for transactions). */
type Queryable = Pick<Pool, "query">;

function buildScopeAndFilters(scope: MemoryScope, filters?: MemoryFilters): WhereClause {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let i = 0;
  const next = (): number => ++i;

  if (scope.tenantId !== undefined) {
    clauses.push(`tenant_id = $${next()}`);
    params.push(scope.tenantId);
  }
  if (scope.namespace !== undefined) {
    clauses.push(`namespace = $${next()}`);
    params.push(scope.namespace);
  }
  if (scope.subjectId !== undefined) {
    clauses.push(`subject_id = $${next()}`);
    params.push(scope.subjectId);
  }

  if (filters?.type) {
    const types = Array.isArray(filters.type) ? filters.type : [filters.type];
    clauses.push(`type = ANY($${next()})`);
    params.push(types);
  }
  if (filters?.state) {
    const states = Array.isArray(filters.state) ? filters.state : [filters.state];
    clauses.push(`state = ANY($${next()})`);
    params.push(states);
  }

  function rangeCol<T extends number | Date>(
    col: string,
    range: { eq?: T; gte?: T; gt?: T; lte?: T; lt?: T } | undefined,
  ): void {
    if (!range) return;
    if (range.eq !== undefined) {
      clauses.push(`${col} = $${next()}`);
      params.push(range.eq);
    }
    if (range.gte !== undefined) {
      clauses.push(`${col} >= $${next()}`);
      params.push(range.gte);
    }
    if (range.gt !== undefined) {
      clauses.push(`${col} > $${next()}`);
      params.push(range.gt);
    }
    if (range.lte !== undefined) {
      clauses.push(`${col} <= $${next()}`);
      params.push(range.lte);
    }
    if (range.lt !== undefined) {
      clauses.push(`${col} < $${next()}`);
      params.push(range.lt);
    }
  }

  rangeCol("importance", filters?.importance);
  rangeCol("confidence", filters?.confidence);
  rangeCol("created_at", filters?.createdAt);
  rangeCol("updated_at", filters?.updatedAt);

  if (filters?.metadata) {
    for (const [key, value] of Object.entries(filters.metadata)) {
      clauses.push(`metadata -> $${next()} = $${next()}::jsonb`);
      params.push(key, JSON.stringify(value));
    }
  }

  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

const ORDER_COLUMN: Record<string, string> = {
  createdAt: "created_at",
  updatedAt: "updated_at",
  importance: "importance",
  confidence: "confidence",
};

const INSERT_SQL = `
  INSERT INTO memories (
    id, tenant_id, namespace, subject_id, type, content, state,
    importance, confidence, source, metadata, created_at, updated_at,
    last_accessed_at, access_count, expires_at, version,
    superseded_by, supersedes, merged_from
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
`;

function insertParams(row: MemoryRow): unknown[] {
  return [
    row.id,
    row.tenant_id,
    row.namespace,
    row.subject_id,
    row.type,
    row.content,
    row.state,
    row.importance,
    row.confidence,
    row.source,
    JSON.stringify(row.metadata),
    row.created_at,
    row.updated_at,
    row.last_accessed_at,
    row.access_count,
    row.expires_at,
    row.version,
    row.superseded_by,
    row.supersedes,
    row.merged_from ? JSON.stringify(row.merged_from) : null,
  ];
}

/**
 * PostgreSQL-backed MemoryStore. Suitable for production, multi-node
 * deployments. Uses the `pg` driver; wraps a `Pool` (or an existing one,
 * for sharing a connection pool across adapters/tests).
 *
 * Call `await store.init()` once before use — creates tables/indexes if
 * they don't already exist (`CREATE TABLE IF NOT EXISTS`), matching the
 * "local-first, zero required migration step" ergonomics of the other
 * storage adapters. For production deployments with a real migration
 * tool, `init()` is safe to skip if you've already applied the schema
 * in `schema.ts` yourself.
 */
export class PostgresStore implements TransactionalMemoryStore {
  private readonly pool: Pool;
  private readonly runner: Queryable;

  constructor(poolOrConnectionString: Pool | string, runner?: Queryable) {
    this.pool =
      typeof poolOrConnectionString === "string"
        ? new Pool({ connectionString: poolOrConnectionString })
        : poolOrConnectionString;
    this.runner = runner ?? this.pool;
  }

  /** Escape hatch for adapters/tests that need direct pool access. */
  get raw(): Pool {
    return this.pool;
  }

  async init(): Promise<void> {
    await this.runner.query(CREATE_MEMORIES_TABLE);
    await this.runner.query(CREATE_VERSIONS_TABLE);
  }

  async create(memory: Memory): Promise<Memory> {
    const row = memoryToRow(memory);
    try {
      await this.runner.query(INSERT_SQL, insertParams(row));
    } catch (err) {
      throw new StorageError(`Failed to create memory ${memory.id}`, { cause: err });
    }
    return memory;
  }

  async get(id: string): Promise<Memory | null> {
    const result = await this.runner.query("SELECT * FROM memories WHERE id = $1", [id]);
    const row = result.rows[0] as MemoryRow | undefined;
    return row ? rowToMemory(row) : null;
  }

  async update(id: string, patch: Partial<Memory>, options?: { expectedVersion?: number }): Promise<Memory> {
    const existingResult = await this.runner.query("SELECT * FROM memories WHERE id = $1", [id]);
    const existingRow = existingResult.rows[0] as MemoryRow | undefined;
    if (!existingRow) {
      throw new MemoryNotFoundError(id);
    }
    if (options?.expectedVersion !== undefined && existingRow.version !== options.expectedVersion) {
      throw new VersionConflictError(id, options.expectedVersion, existingRow.version);
    }

    const existing = rowToMemory(existingRow);
    const merged: Memory = { ...existing, ...patch, id: existing.id, createdAt: existing.createdAt };
    const row = memoryToRow(merged);

    await this.runner.query(
      `UPDATE memories SET
        content = $1, state = $2, importance = $3, confidence = $4, source = $5,
        metadata = $6::jsonb, updated_at = $7, last_accessed_at = $8, access_count = $9,
        expires_at = $10, version = $11, superseded_by = $12, supersedes = $13, merged_from = $14
      WHERE id = $15`,
      [
        row.content,
        row.state,
        row.importance,
        row.confidence,
        row.source,
        JSON.stringify(row.metadata),
        row.updated_at,
        row.last_accessed_at,
        row.access_count,
        row.expires_at,
        row.version,
        row.superseded_by,
        row.supersedes,
        row.merged_from ? JSON.stringify(row.merged_from) : null,
        id,
      ],
    );

    return merged;
  }

  async delete(id: string): Promise<void> {
    await this.runner.query("DELETE FROM memories WHERE id = $1", [id]);
    await this.runner.query("DELETE FROM memory_versions WHERE memory_id = $1", [id]);
  }

  async list(options: ListOptions = {}): Promise<Memory[]> {
    const { sql: whereSql, params } = buildScopeAndFilters(options, options.filters);
    const orderCol = ORDER_COLUMN[options.orderBy ?? "createdAt"] ?? "created_at";
    const direction = options.orderDirection === "desc" ? "DESC" : "ASC";
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;
    const limit = options.limit ?? null;
    const offset = options.offset ?? 0;

    const result = await this.runner.query(
      `SELECT * FROM memories ${whereSql} ORDER BY ${orderCol} ${direction} LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...params, limit, offset],
    );
    return (result.rows as MemoryRow[]).map(rowToMemory);
  }

  async count(options: CountOptions = {}): Promise<number> {
    const { sql: whereSql, params } = buildScopeAndFilters(options, options.filters);
    const result = await this.runner.query(`SELECT COUNT(*)::int AS count FROM memories ${whereSql}`, params);
    return (result.rows[0] as { count: number }).count;
  }

  async createMany(memories: Memory[]): Promise<Memory[]> {
    return this.transaction(async (tx) => {
      for (const m of memories) {
        await tx.create(m);
      }
      return memories;
    });
  }

  async deleteMany(ids: string[]): Promise<void> {
    await this.transaction(async (tx) => {
      for (const id of ids) {
        await tx.delete(id);
      }
    });
  }

  async transaction<T>(fn: (tx: MemoryStore) => Promise<T>): Promise<T> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const txStore = new PostgresStore(this.pool, client);
      const result = await fn(txStore);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
