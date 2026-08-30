import type { Pool } from "pg";
import type { ConflictStore } from "@memorie/storage";
import type { MemoryConflict, ConflictResolutionStrategy, ConflictStatus } from "@memorie/types";
import { MemoryNotFoundError } from "@memorie/types";
import { CREATE_CONFLICTS_TABLE } from "./schema.js";

type Queryable = Pick<Pool, "query">;

interface ConflictRow {
  id: string;
  memory_a: string;
  memory_b: string;
  type: string;
  confidence: number;
  status: string;
  resolution: string | null;
  resolved_memory_id: string | null;
  created_at: Date;
  resolved_at: Date | null;
}

function rowToConflict(row: ConflictRow): MemoryConflict {
  return {
    id: row.id,
    memoryA: row.memory_a,
    memoryB: row.memory_b,
    type: row.type,
    confidence: row.confidence,
    status: row.status as ConflictStatus,
    resolution: (row.resolution as ConflictResolutionStrategy | null) ?? undefined,
    resolvedMemoryId: row.resolved_memory_id ?? undefined,
    createdAt: new Date(row.created_at),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
  };
}

/** PostgreSQL-backed ConflictStore. Call `await store.init()` once before use. */
export class PostgresConflictStore implements ConflictStore {
  private readonly runner: Queryable;

  constructor(pool: Pool, runner?: Queryable) {
    this.runner = runner ?? pool;
  }

  async init(): Promise<void> {
    await this.runner.query(CREATE_CONFLICTS_TABLE);
  }

  async record(conflict: MemoryConflict): Promise<void> {
    await this.runner.query(
      `INSERT INTO memory_conflicts
        (id, memory_a, memory_b, type, confidence, status, resolution, resolved_memory_id, created_at, resolved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        conflict.id,
        conflict.memoryA,
        conflict.memoryB,
        conflict.type,
        conflict.confidence,
        conflict.status,
        conflict.resolution ?? null,
        conflict.resolvedMemoryId ?? null,
        conflict.createdAt,
        conflict.resolvedAt ?? null,
      ],
    );
  }

  async get(id: string): Promise<MemoryConflict | null> {
    const result = await this.runner.query("SELECT * FROM memory_conflicts WHERE id = $1", [id]);
    const row = result.rows[0] as ConflictRow | undefined;
    return row ? rowToConflict(row) : null;
  }

  async list(options?: { memoryId?: string; status?: ConflictStatus }): Promise<MemoryConflict[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    let i = 0;
    if (options?.memoryId !== undefined) {
      clauses.push(`(memory_a = $${++i} OR memory_b = $${i})`);
      params.push(options.memoryId);
    }
    if (options?.status !== undefined) {
      clauses.push(`status = $${++i}`);
      params.push(options.status);
    }
    const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await this.runner.query(`SELECT * FROM memory_conflicts ${whereSql}`, params);
    return (result.rows as ConflictRow[]).map(rowToConflict);
  }

  async resolve(
    id: string,
    resolution: ConflictResolutionStrategy,
    resolvedMemoryId: string | undefined,
    resolvedAt: Date,
  ): Promise<MemoryConflict> {
    const result = await this.runner.query(
      `UPDATE memory_conflicts SET status = 'resolved', resolution = $1, resolved_memory_id = $2, resolved_at = $3
       WHERE id = $4 RETURNING *`,
      [resolution, resolvedMemoryId ?? null, resolvedAt, id],
    );
    const row = result.rows[0] as ConflictRow | undefined;
    if (!row) {
      throw new MemoryNotFoundError(id, { details: { kind: "conflict" } });
    }
    return rowToConflict(row);
  }
}
